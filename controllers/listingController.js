const listingModel = require('../models/listingModel');
const { serverError, notFound, badRequest } = require('../utils/errorHandler');
const { getFileUrl, deleteFile } = require('../utils/fileUpload');

/**
 * Listing Controller
 * Handles HTTP requests for listing operations
 */
const listingController = {
  /**
   * Get all listings
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getAll(req, res, next) {
    try {
      // Parse query parameters
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const filters = {};
      
      // Add filters if provided
      if (req.query.title) filters.title = req.query.title;
      if (req.query.category_id) filters.category_id = parseInt(req.query.category_id);
      if (req.query.main_category_id) filters.main_category_id = parseInt(req.query.main_category_id);
      if (req.query.user_id) filters.user_id = parseInt(req.query.user_id);
      if (req.query.min_price) filters.min_price = parseFloat(req.query.min_price);
      if (req.query.max_price) filters.max_price = parseFloat(req.query.max_price);
      if (req.query.location) filters.location = req.query.location;
      
      // Add combined search filter (searches in both title and location)
      if (req.query.search) filters.search = req.query.search;
      
      // Handle date filters
      if (req.query.start_date) {
        filters.start_date = req.query.start_date;
        console.log(`Start date filter: ${req.query.start_date}`);
      }
      if (req.query.end_date) {
        filters.end_date = req.query.end_date;
        console.log(`End date filter: ${req.query.end_date}`);
      }
      
      // Handle boolean filters
      if (req.query.is_hourly !== undefined) {
        filters.is_hourly = req.query.is_hourly === 'true';
      }
      if (req.query.active !== undefined) {
        filters.active = req.query.active === 'true';
      }
      if (req.query.include_subcategories !== undefined) {
        filters.include_subcategories = req.query.include_subcategories === 'true';
      }
      if (req.query.instant_booking !== undefined) {
        filters.instant_booking = req.query.instant_booking === 'true';
      }
      
      // Property-specific filters
      if (req.query.max_guests) filters.max_guests = parseInt(req.query.max_guests);
      if (req.query.bedrooms) filters.bedrooms = parseInt(req.query.bedrooms);
      if (req.query.beds) filters.beds = parseInt(req.query.beds);
      if (req.query.bathrooms) filters.bathrooms = parseFloat(req.query.bathrooms);
      if (req.query.room_type) filters.room_type = req.query.room_type;
      
      // Location-based search
      if (req.query.latitude && req.query.longitude && req.query.radius) {
        filters.latitude = parseFloat(req.query.latitude);
        filters.longitude = parseFloat(req.query.longitude);
        filters.radius = parseFloat(req.query.radius);
      }
      
      // Handle amenities filter (can be single value or array)
      if (req.query.amenities) {
        if (Array.isArray(req.query.amenities)) {
          filters.amenities = req.query.amenities.map(id => parseInt(id));
        } else {
          filters.amenities = [parseInt(req.query.amenities)];
        }
      }
      
      // Sort options
      if (req.query.sort_by) {
        filters.sort_by = req.query.sort_by;
      }
      
      console.log('Applying filters:', filters);
      
      // Get listings
      const listings = await listingModel.getAll(filters, page, limit);
      
      // Count total listings for pagination
      const countQuery = await listingModel.getAll(filters, 1, Number.MAX_SAFE_INTEGER);
      const totalCount = countQuery.length;
      
      res.status(200).json({
        status: 'success',
        results: listings.length,
        totalCount,
        page,
        totalPages: Math.ceil(totalCount / limit),
        data: listings
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Get listing by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const listing = await listingModel.getById(id);
      
      res.status(200).json({
        status: 'success',
        data: listing
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Get all main categories (parent_id is NULL)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getMainCategories(req, res, next) {
    try {
      const categories = await listingModel.getMainCategories();
      
      res.status(200).json({
        status: 'success',
        results: categories.length,
        data: categories
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Get subcategories by parent ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getSubcategories(req, res, next) {
    try {
      const { parentId } = req.params;
      
      if (!parentId) {
        return next(badRequest('Parent ID is required'));
      }
      
      const subcategories = await listingModel.getSubcategories(parentId);
      
      res.status(200).json({
        status: 'success',
        results: subcategories.length,
        data: subcategories
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Create a new listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async create(req, res, next) {
    try {
      const listingData = req.body;
      
      // Set user ID from authenticated user
      listingData.user_id = req.user.id;
      
      // Validate required fields
      if (!listingData.listing_type) {
        return res.status(400).json({
          status: 'error',
          message: 'Listing type is required'
        });
      }
      
      if (!listingData.category_id) {
        return res.status(400).json({
          status: 'error',
          message: 'Category is required'
        });
      }
      
      // Handle photos if files are uploaded
      if (req.files && req.files.length > 0) {
        listingData.photos = req.files.map((file, index) => ({
          image_url: getFileUrl(file.filename),
          is_cover: index === 0 // First photo is cover by default
        }));
      }
      
      // Create listing
      const listing = await listingModel.create(listingData);
      
      res.status(201).json({
        status: 'success',
        data: listing
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Update a listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const listingData = req.body;
      
      // Check if user owns the listing
      const listing = await listingModel.getById(id);
      if (listing.user_id !== req.user.id && !req.user.is_admin) {
        return next(badRequest('You do not own this listing'));
      }
      
      // Handle photos if files are uploaded
      if (req.files && req.files.length > 0) {
        listingData.photos = req.files.map(file => ({
          image_url: getFileUrl(file.filename),
          is_cover: false // Don't set as cover by default when updating
        }));
      }
      
      const updatedListing = await listingModel.update(id, listingData);
      
      res.status(200).json({
        status: 'success',
        data: updatedListing
      });
    } catch (error) {
      // Delete uploaded files if there was an error
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => deleteFile(file.filename));
      }
      next(error);
    }
  },
  
  /**
   * Delete a listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async delete(req, res, next) {
    try {
      const { id } = req.params;
      
      // Check if user owns the listing
      const listing = await listingModel.getById(id);
      if (listing.user_id !== req.user.id && !req.user.is_admin) {
        return next(badRequest('You do not own this listing'));
      }
      
      // Delete listing photos
      if (listing.photos && listing.photos.length > 0) {
        listing.photos.forEach(photo => {
          const filename = photo.image_url.split('/').pop();
          deleteFile(filename);
        });
      }
      
      await listingModel.delete(id);
      
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Add photos to a listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async addPhotos(req, res, next) {
    try {
      const { id } = req.params;
      
      console.log(`Adding photos to listing ${id}`);
      
      // Check if user owns the listing
      const listing = await listingModel.getById(id);
      if (!listing) {
        return next(notFound('Listing not found'));
      }
      
      if (listing.user_id !== req.user.id && !req.user.is_admin) {
        return next(badRequest('You do not own this listing'));
      }
      
      // Check if files are uploaded
      if (!req.files || req.files.length === 0) {
        console.log('No photos uploaded in request');
        return next(badRequest('No photos uploaded'));
      }
      
      console.log(`Found ${req.files.length} uploaded files`);
      
      const addedPhotos = [];
      
      // Add each photo
      for (const file of req.files) {
        console.log(`Processing file: ${file.originalname}, saved as ${file.filename}`);
        const imageUrl = getFileUrl(file.filename);
        console.log(`Generated image URL: ${imageUrl}`);
        
        try {
          const photo = await listingModel.addPhoto(id, imageUrl);
          addedPhotos.push(photo);
        } catch (photoError) {
          console.error(`Error adding photo ${file.filename}:`, photoError);
          // Delete the file if there was an error adding it to the database
          deleteFile(file.filename);
        }
      }
      
      if (addedPhotos.length === 0) {
        return next(serverError('Failed to add any photos'));
      }
      
      console.log(`Successfully added ${addedPhotos.length} photos`);
      
      res.status(201).json({
        status: 'success',
        results: addedPhotos.length,
        data: addedPhotos
      });
    } catch (error) {
      console.error('Error adding photos:', error);
      
      // Delete uploaded files if there was an error
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => deleteFile(file.filename));
      }
      next(error);
    }
  },
  
  /**
   * Delete a photo from a listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async deletePhoto(req, res, next) {
    try {
      const { id, photoId } = req.params;
      
      console.log(`Deleting photo ${photoId} from listing ${id}`);
      
      // Check if user owns the listing
      const listing = await listingModel.getById(id);
      if (!listing) {
        return next(notFound('Listing not found'));
      }
      
      if (listing.user_id !== req.user.id && !req.user.is_admin) {
        return next(badRequest('You do not own this listing'));
      }
      
      // Find the photo
      const photos = await listingModel.getListingPhotos(id);
      const photo = photos.find(p => p.id === parseInt(photoId));
      
      if (!photo) {
        return next(notFound('Photo not found'));
      }
      
      // Delete the photo file
      const filename = photo.image_url.split('/').pop();
      deleteFile(filename);
      
      // Delete from database
      await listingModel.deletePhoto(photoId);
      
      res.status(204).end();
    } catch (error) {
      console.error('Error deleting photo:', error);
      next(error);
    }
  },
  
  /**
   * Set a photo as the cover photo
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async setCoverPhoto(req, res, next) {
    try {
      const { id, photoId } = req.params;
      
      console.log(`Setting photo ${photoId} as cover for listing ${id}`);
      
      // Check if user owns the listing
      const listing = await listingModel.getById(id);
      if (!listing) {
        return next(notFound('Listing not found'));
      }
      
      if (listing.user_id !== req.user.id && !req.user.is_admin) {
        return next(badRequest('You do not own this listing'));
      }
      
      // Find the photo
      const photos = await listingModel.getListingPhotos(id);
      const photo = photos.find(p => p.id === parseInt(photoId));
      
      if (!photo) {
        return next(notFound('Photo not found'));
      }
      
      // Set as cover
      await listingModel.setCoverPhoto(photoId);
      
      res.status(200).json({
        status: 'success',
        message: 'Cover photo updated'
      });
    } catch (error) {
      console.error('Error setting cover photo:', error);
      next(error);
    }
  },
  
  /**
   * Check availability for a listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async checkAvailability(req, res, next) {
    try {
      const { id } = req.params;
      let start_datetime, end_datetime;
      
      // Handle both GET and POST requests
      if (req.method === 'GET') {
        start_datetime = req.query.start_datetime || req.query.start_date;
        end_datetime = req.query.end_datetime || req.query.end_date;
      } else {
        // POST method
        start_datetime = req.body.start_datetime || req.body.start_date;
        end_datetime = req.body.end_datetime || req.body.end_date;
      }
      
      // Format dates if they don't include time
      if (start_datetime && !start_datetime.includes('T') && !start_datetime.includes(' ')) {
        start_datetime = `${start_datetime}T00:00:00`;
      }
      
      if (end_datetime && !end_datetime.includes('T') && !end_datetime.includes(' ')) {
        end_datetime = `${end_datetime}T23:59:59`;
      }
      
      if (!start_datetime || !end_datetime) {
        return res.status(400).json({
          status: 'error',
          message: 'Start and end datetime are required'
        });
      }
      
      console.log(`Checking availability for listing ${id} from ${start_datetime} to ${end_datetime}`);
      
      const isAvailable = await listingModel.checkAvailability(id, start_datetime, end_datetime);
      
      res.status(200).json({
        status: 'success',
        data: {
          is_available: isAvailable
        }
      });
    } catch (error) {
      console.error('Error checking availability:', error);
      
      // Handle specific errors with appropriate status codes
      if (error.statusCode === 404) {
        return res.status(404).json({
          status: 'error',
          message: error.message || 'Listing not found'
        });
      } else if (error.statusCode === 400) {
        return res.status(400).json({
          status: 'error',
          message: error.message || 'Invalid request'
        });
      }
      
      next(error);
    }
  },
  
  /**
   * Add availability to a listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async addAvailability(req, res, next) {
    try {
      const { id } = req.params;
      const { availability } = req.body;
      
      // Check if user owns the listing
      const listing = await listingModel.getById(id);
      if (listing.user_id !== req.user.id && !req.user.is_admin) {
        return next(badRequest('You do not own this listing'));
      }
      
      if (!availability || !Array.isArray(availability) || availability.length === 0) {
        return next(badRequest('Availability data is required'));
      }
      
      const addedAvailability = await listingModel.addAvailability(id, availability);
      
      res.status(201).json({
        status: 'success',
        results: addedAvailability.length,
        data: addedAvailability
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = listingController; 