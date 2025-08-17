const listingModel = require('../models/listingModel');
const { serverError, notFound, badRequest } = require('../utils/errorHandler');
const { getFileUrl, deleteFile, uploadToCloudinary } = require('../utils/fileUpload');
const db = require('../config/database');

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
      }
      if (req.query.end_date) {
        filters.end_date = req.query.end_date;
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
        return next(badRequest('Listing type is required'));
      }
      
      // Process pricing_details if provided
      if (listingData.pricing_details) {
        try {
          // If pricing_details is a string, parse it
          if (typeof listingData.pricing_details === 'string') {
            listingData.pricing_details = JSON.parse(listingData.pricing_details);
          }
          
          // Extract legacy pricing fields for backward compatibility
          const hourPrice = listingData.pricing_details.find(p => p.unit_type === 'hour');
          const dayPrice = listingData.pricing_details.find(p => p.unit_type === 'day');
          const nightPrice = listingData.pricing_details.find(p => p.unit_type === 'night');
          
          if (hourPrice) listingData.price_per_hour = parseFloat(hourPrice.price);
          if (dayPrice) listingData.price_per_day = parseFloat(dayPrice.price);
          if (nightPrice) listingData.price_per_half_night = parseFloat(nightPrice.price);
          
          // Set unit_type based on first pricing option if not already set
          if (!listingData.unit_type && listingData.pricing_details.length > 0) {
            listingData.unit_type = listingData.pricing_details[0].unit_type;
          }
        } catch (error) {
          console.error('Error processing pricing details:', error);
          return next(badRequest('Invalid pricing details format'));
        }
      }
      
      if (!listingData.category_id) {
        return next(badRequest('Category is required'));
      }
      
      // Validate cancellation policy
      if (listingData.cancellation_policy) {
        const validPolicies = ['flexible', 'moderate', 'strict', 'non_refundable'];
        if (!validPolicies.includes(listingData.cancellation_policy)) {
          return next(badRequest('Invalid cancellation policy'));
        }
      } else {
        // Set default cancellation policy if not provided
        listingData.cancellation_policy = 'moderate';
      }
      
      // Handle photos if files are uploaded
      if (req.files && req.files.length > 0) {
        const uploadedPhotos = [];
        
        for (const file of req.files) {
          try {
            // Upload to Cloudinary
            const cloudinaryResult = await uploadToCloudinary(file.path);
            uploadedPhotos.push({
              image_url: cloudinaryResult.secure_url,
              is_cover: uploadedPhotos.length === 0 // First photo is cover by default
            });
          } catch (uploadError) {
            console.error(`Error uploading file ${file.filename}:`, uploadError);
            // Delete the local file if upload failed
            if (file.path && require('fs').existsSync(file.path)) {
              require('fs').unlinkSync(file.path);
            }
          }
        }
        
        listingData.photos = uploadedPhotos;
      }
      
      // Create listing
      const listing = await listingModel.create(listingData);
      
      res.status(201).json({
        status: 'success',
        data: listing
      });
    } catch (error) {
      console.error('Error creating listing:', error);
      
      // Clean up uploaded files if there was an error
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          if (file.path && require('fs').existsSync(file.path)) {
            require('fs').unlinkSync(file.path);
          }
        });
      }
      
      // Handle specific errors
      if (error.code === 'ER_NO_SUCH_TABLE') {
        return next(serverError('Database table not found'));
      } else if (error.code === 'ER_BAD_FIELD_ERROR') {
        return next(serverError('Invalid database field'));
      } else if (error.message && error.message.includes('cancellation_policy')) {
        return next(badRequest('Invalid cancellation policy'));
      }
      
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
      
      // Process pricing_details if provided
      if (listingData.pricing_details) {
        try {
          // If pricing_details is a string, parse it
          if (typeof listingData.pricing_details === 'string') {
            listingData.pricing_details = JSON.parse(listingData.pricing_details);
          }
          
          // Extract legacy pricing fields for backward compatibility
          const hourPrice = listingData.pricing_details.find(p => p.unit_type === 'hour');
          const dayPrice = listingData.pricing_details.find(p => p.unit_type === 'day');
          const nightPrice = listingData.pricing_details.find(p => p.unit_type === 'night');
          
          if (hourPrice) listingData.price_per_hour = parseFloat(hourPrice.price);
          if (dayPrice) listingData.price_per_day = parseFloat(dayPrice.price);
          if (nightPrice) listingData.price_per_half_night = parseFloat(nightPrice.price);
          
          // Set unit_type based on first pricing option if not already set
          if (!listingData.unit_type && listingData.pricing_details.length > 0) {
            listingData.unit_type = listingData.pricing_details[0].unit_type;
          }
        } catch (error) {
          console.error('Error processing pricing details:', error);
          return next(badRequest('Invalid pricing details format'));
        }
      }
      
      // Start a transaction
      const connection = await db.getPool().getConnection();
      await connection.beginTransaction();
      
      try {
        // Handle photo deletions first
        if (listingData.photos_to_delete && listingData.photos_to_delete.length > 0) {
          
          // Get photo URLs before deleting
          const photosToDelete = await connection.query(
            'SELECT image_url FROM listing_photos WHERE id IN (?)',
            [listingData.photos_to_delete]
          );

          // Delete photos from Cloudinary
          for (const photo of photosToDelete) {
            try {
              // Extract public_id from Cloudinary URL
              const publicId = photo.image_url.split('/').slice(-1)[0].split('.')[0];
              await deleteFile(publicId);
            } catch (error) {
              console.error('Error deleting photo from Cloudinary:', error);
            }
          }

          // Delete photos from database
          await connection.query(
            'DELETE FROM listing_photos WHERE id IN (?)',
            [listingData.photos_to_delete]
          );
        }

        // Update existing photos' cover status
        if (listingData.existing_photos) {
          for (const photo of listingData.existing_photos) {
            await connection.query(
              'UPDATE listing_photos SET is_cover = ? WHERE id = ?',
              [photo.is_cover ? 1 : 0, photo.id]
            );
          }
        }

        // Handle new photos if files are uploaded
        if (req.files && req.files.length > 0) {
          const uploadedPhotos = [];
          
          for (const file of req.files) {
            try {
              // Upload to Cloudinary
              const cloudinaryResult = await uploadToCloudinary(file.path);
              uploadedPhotos.push({
                image_url: cloudinaryResult.secure_url,
                is_cover: false // Don't set as cover by default when updating
              });
            } catch (uploadError) {
              console.error(`Error uploading file ${file.filename}:`, uploadError);
              // Delete the local file if upload failed
              if (file.path && require('fs').existsSync(file.path)) {
                require('fs').unlinkSync(file.path);
              }
            }
          }
          
          // Insert new photos
          for (const photo of uploadedPhotos) {
            await connection.query(
              'INSERT INTO listing_photos (listing_id, image_url, is_cover) VALUES (?, ?, ?)',
              [id, photo.image_url, photo.is_cover ? 1 : 0]
            );
          }
        }
        
        const updatedListing = await listingModel.update(id, listingData);
        
        // Commit transaction
        await connection.commit();
        
        res.status(200).json({
          status: 'success',
          data: updatedListing
        });
      } catch (error) {
        // Rollback transaction on error
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      // Delete uploaded files if there was an error
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          if (file.path && require('fs').existsSync(file.path)) {
            require('fs').unlinkSync(file.path);
          }
        });
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
        return next(badRequest('No photos uploaded'));
      }
            
      const addedPhotos = [];
      
      // Add each photo
      for (const file of req.files) {
        
        try {
          // Upload to Cloudinary
          const cloudinaryResult = await uploadToCloudinary(file.path);
          
          // Add to database with Cloudinary URL
          const photo = await listingModel.addPhoto(id, cloudinaryResult.secure_url);
          addedPhotos.push(photo);
        } catch (photoError) {
          console.error(`Error adding photo ${file.filename}:`, photoError);
          // Delete the local file if there was an error
          if (file.path && require('fs').existsSync(file.path)) {
            require('fs').unlinkSync(file.path);
          }
        }
      }
      
      if (addedPhotos.length === 0) {
        return next(serverError('Failed to add any photos'));
      }
      
      
      res.status(201).json({
        status: 'success',
        results: addedPhotos.length,
        data: addedPhotos
      });
    } catch (error) {
      console.error('Error adding photos:', error);
      
      // Delete uploaded files if there was an error
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          if (file.path && require('fs').existsSync(file.path)) {
            require('fs').unlinkSync(file.path);
          }
        });
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