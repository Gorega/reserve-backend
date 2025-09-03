const listingModel = require('../models/listingModel');
const pricingOptionModel = require('../models/pricingOptionModel');
const specialPricingModel = require('../models/specialPricingModel');
const { serverError, notFound, badRequest } = require('../utils/errorHandler');
const { getFileUrl, deleteFile, uploadToCloudinary } = require('../utils/fileUpload');
const db = require('../config/database');
const smartPricingUtils = require('../utils/smartPricingUtils');

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
   * Get effective price for a listing on a specific date
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getEffectivePrice(req, res, next) {
    try {
      const { id } = req.params;
      const { date, pricing_option_id } = req.query;
      
      if (!date) {
        return res.status(400).json({
          status: 'error',
          message: 'Date parameter is required'
        });
      }
      
      const specialPricingModel = require('../models/specialPricingModel');
      const effectivePrice = await specialPricingModel.getEffectivePrice(id, date, pricing_option_id);
      
      res.status(200).json({
        status: 'success',
        data: effectivePrice
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
      
      // Process pricing options if provided
      if (listingData.pricing_options) {
        if (!Array.isArray(listingData.pricing_options)) {
          try {
            listingData.pricing_options = JSON.parse(listingData.pricing_options);
          } catch (error) {
            return next(badRequest('Invalid pricing options format'));
          }
        }
        
        // Validate pricing options
        if (!Array.isArray(listingData.pricing_options) || listingData.pricing_options.length === 0) {
          return next(badRequest('At least one pricing option is required'));
        }
        
        // Clean up pricing options to ensure proper format
        listingData.pricing_options = listingData.pricing_options.map(option => {
          // Remove any client-side string IDs that might cause database issues
          const cleanOption = {...option};
          if (cleanOption.id && typeof cleanOption.id === 'string') {
            delete cleanOption.id;
          }
          
          return {
            ...cleanOption,
            price: parseFloat(cleanOption.price),
            unit_type: cleanOption.unit_type,
            duration: parseInt(cleanOption.duration) || 1,
            is_default: Boolean(cleanOption.is_default),
            minimum_units: parseInt(cleanOption.minimum_units) || 1
          };
        });
        
        // Ensure at least one option is marked as default
        if (!listingData.pricing_options.some(option => option.is_default)) {
          listingData.pricing_options[0].is_default = true;
        }
        
        // Set legacy fields for backward compatibility
        const hourOption = listingData.pricing_options.find(p => p.unit_type === 'hour');
        const dayOption = listingData.pricing_options.find(p => p.unit_type === 'day');
        const nightOption = listingData.pricing_options.find(p => p.unit_type === 'night');
        
        if (hourOption) listingData.price_per_hour = parseFloat(hourOption.price);
        if (dayOption) listingData.price_per_day = parseFloat(dayOption.price);
        if (nightOption) listingData.price_per_half_night = parseFloat(nightOption.price);
        
        // Set default unit_type if not provided
        if (!listingData.unit_type) {
          const defaultOption = listingData.pricing_options.find(p => p.is_default);
          listingData.unit_type = defaultOption ? defaultOption.unit_type : 
            listingData.pricing_options[0].unit_type;
        }
      } 
      // Create pricing options from legacy fields if not provided
      else if (listingData.price_per_hour || listingData.price_per_day || listingData.price_per_half_night) {
        listingData.pricing_options = [];
        
        if (listingData.price_per_hour) {
          listingData.pricing_options.push({
            price: parseFloat(listingData.price_per_hour),
            unit_type: 'hour',
            duration: 1,
            is_default: listingData.unit_type === 'hour' || !listingData.unit_type
          });
        }
        
        if (listingData.price_per_day) {
          listingData.pricing_options.push({
            price: parseFloat(listingData.price_per_day),
            unit_type: 'day',
            duration: 1,
            is_default: listingData.unit_type === 'day'
          });
        }
        
        if (listingData.price_per_half_night) {
          listingData.pricing_options.push({
            price: parseFloat(listingData.price_per_half_night),
            unit_type: 'night',
            duration: 1,
            is_default: listingData.unit_type === 'night'
          });
        }
        
        // Set default unit_type if not provided
        if (!listingData.unit_type && listingData.pricing_options.length > 0) {
          listingData.unit_type = listingData.pricing_options[0].unit_type;
        }
      } else {
        return next(badRequest('At least one pricing option is required'));
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
      
      // Handle special pricing if provided
      if (listingData.special_pricing && Array.isArray(listingData.special_pricing) && listingData.special_pricing.length > 0) {
        try {
          for (const specialPricingItem of listingData.special_pricing) {
            // Set listing ID for the special pricing
            specialPricingItem.listing_id = listing.id;
            
            // Find the corresponding pricing option ID from the created listing
            if (specialPricingItem.pricing_option_id && typeof specialPricingItem.pricing_option_id === 'string') {
              // If it's a client-side ID, find the actual pricing option
              const pricingOptions = await pricingOptionModel.getByListingId(listing.id);
              const matchingOption = pricingOptions.find(option => 
                option.unit_type === (listingData.pricing_options.find(p => p.id === specialPricingItem.pricing_option_id)?.unit_type)
              );
              if (matchingOption) {
                specialPricingItem.pricing_option_id = matchingOption.id;
              }
            }
            
            // Convert pricing_option to valid ENUM value
            let pricingOption = 'per_hour'; // default
            if (specialPricingItem.pricing_option_id) {
              // Use pricing_option_id to determine the correct ENUM value
              if (specialPricingItem.pricing_option_id === 1 || specialPricingItem.pricing_option_id === 'hour') {
                pricingOption = 'per_hour';
              } else if (specialPricingItem.pricing_option_id === 2 || specialPricingItem.pricing_option_id === 'day') {
                pricingOption = 'per_day';
              } else if (specialPricingItem.pricing_option_id === 3 || specialPricingItem.pricing_option_id === 'night') {
                pricingOption = 'per_night';
              }
            } else if (specialPricingItem.pricing_option) {
              // Handle direct ENUM values or convert from unit_type
              const option = specialPricingItem.pricing_option.toLowerCase();
              if (option === 'per_hour' || option === 'hour') {
                pricingOption = 'per_hour';
              } else if (option === 'per_day' || option === 'day') {
                pricingOption = 'per_day';
              } else if (option === 'per_night' || option === 'night') {
                pricingOption = 'per_night';
              }
            }

            // Create the special pricing entry with correct column mapping
             const specialPricingData = {
               listing_id: specialPricingItem.listing_id,
               price: specialPricingItem.special_price || specialPricingItem.price,
               pricing_option: pricingOption,
               date: specialPricingItem.specific_date || specialPricingItem.date || null,
               day_of_week: specialPricingItem.day_of_week || null,
               is_recurring: specialPricingItem.is_recurring || false,
               start_date: specialPricingItem.recurring_start_date || specialPricingItem.start_date || null,
               end_date: specialPricingItem.recurring_end_date || specialPricingItem.end_date || null,
               reason: specialPricingItem.reason || ''
             };
             await specialPricingModel.create(specialPricingData);
          }
        } catch (specialPricingError) {
          console.error('Error creating special pricing:', specialPricingError);
          // Don't fail the entire request if special pricing fails
        }
      }
      
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
      let listingData = req.body;
      
      // Handle pricing_options if it's a string (from JSON.stringify)
      if (listingData.pricing_options && typeof listingData.pricing_options === 'string') {
        try {
          listingData.pricing_options = JSON.parse(listingData.pricing_options);
        } catch (e) {
          console.error('Error parsing pricing_options:', e);
        }
      }
      
      // Check if user owns the listing
      const listing = await listingModel.getById(id);
      if (listing.user_id !== req.user.id && !req.user.is_admin) {
        return next(badRequest('You do not own this listing'));
      }
      
      // Process pricing options if provided
      if (listingData.pricing_options) {
        if (!Array.isArray(listingData.pricing_options)) {
          try {
            listingData.pricing_options = JSON.parse(listingData.pricing_options);
          } catch (error) {
            return next(badRequest('Invalid pricing options format'));
          }
        }
        
        // Validate pricing options
        if (!Array.isArray(listingData.pricing_options) || listingData.pricing_options.length === 0) {
          return next(badRequest('At least one pricing option is required'));
        }
        
        // Clean up pricing options to ensure proper format
        listingData.pricing_options = listingData.pricing_options.map(option => {
          // Remove any client-side string IDs that might cause database issues
          const cleanOption = {...option};
          if (cleanOption.id && typeof cleanOption.id === 'string') {
            delete cleanOption.id;
          }
          
          return {
            ...cleanOption,
            price: parseFloat(cleanOption.price),
            unit_type: cleanOption.unit_type,
            duration: parseInt(cleanOption.duration) || 1,
            is_default: Boolean(cleanOption.is_default),
            minimum_units: parseInt(cleanOption.minimum_units) || 1
          };
        });
        
        // Ensure at least one option is marked as default
        if (!listingData.pricing_options.some(option => option.is_default)) {
          listingData.pricing_options[0].is_default = true;
        }
        
        // Set legacy fields for backward compatibility
        const hourOption = listingData.pricing_options.find(p => p.unit_type === 'hour');
        const dayOption = listingData.pricing_options.find(p => p.unit_type === 'day');
        const nightOption = listingData.pricing_options.find(p => p.unit_type === 'night');
        
        if (hourOption) listingData.price_per_hour = parseFloat(hourOption.price);
        if (dayOption) listingData.price_per_day = parseFloat(dayOption.price);
        if (nightOption) listingData.price_per_half_night = parseFloat(nightOption.price);
        
        // Set default unit_type if not provided
        if (!listingData.unit_type) {
          const defaultOption = listingData.pricing_options.find(p => p.is_default);
          listingData.unit_type = defaultOption ? defaultOption.unit_type : 
            listingData.pricing_options[0].unit_type;
        }
      } 
      // Create pricing options from legacy fields if provided but no pricing_options
      else if (listingData.price_per_hour || listingData.price_per_day || listingData.price_per_half_night) {
        listingData.pricing_options = [];
        
        if (listingData.price_per_hour) {
          listingData.pricing_options.push({
            price: parseFloat(listingData.price_per_hour),
            unit_type: 'hour',
            duration: 1,
            is_default: listingData.unit_type === 'hour' || !listingData.unit_type
          });
        }
        
        if (listingData.price_per_day) {
          listingData.pricing_options.push({
            price: parseFloat(listingData.price_per_day),
            unit_type: 'day',
            duration: 1,
            is_default: listingData.unit_type === 'day'
          });
        }
        
        if (listingData.price_per_half_night) {
          listingData.pricing_options.push({
            price: parseFloat(listingData.price_per_half_night),
            unit_type: 'night',
            duration: 1,
            is_default: listingData.unit_type === 'night'
          });
        }
        
        // Set default unit_type if not provided
        if (!listingData.unit_type && listingData.pricing_options.length > 0) {
          listingData.unit_type = listingData.pricing_options[0].unit_type;
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
              // Check if image_url exists and is a valid string
              if (photo && photo.image_url && typeof photo.image_url === 'string') {
              // Extract public_id from Cloudinary URL
                const urlParts = photo.image_url.split('/');
                if (urlParts.length > 0) {
                  const fileNameWithExt = urlParts[urlParts.length - 1];
                  const publicId = fileNameWithExt.split('.')[0];
              await deleteFile(publicId);
                }
              }
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
        
        // Handle the update directly here instead of calling listingModel.update
        // This avoids nested transactions which can cause lock timeouts
        
        // Create a clean object with only valid listing table fields
        const validListingFields = [
          'user_id', 'category_id', 'listing_type', 'title', 'description',
          'price_per_hour', 'price_per_day', 'price_per_half_night', 'unit_type',
          'is_hourly', 'location', 'latitude', 'longitude', 'instant_booking',
          'cancellation_policy', 'active'
        ];
        
        // Extract only the fields that belong in the listings table
        const mainListingData = {};
        for (const field of validListingFields) {
          if (listingData[field] !== undefined) {
            mainListingData[field] = listingData[field];
          }
        }
        
        // These fields are already excluded by using the validListingFields approach
        
        // Update main listing data
        if (Object.keys(mainListingData).length > 0) {
          await connection.query(
            'UPDATE listings SET ? WHERE id = ?',
            [mainListingData, id]
          );
        }
        
        // Update pricing options if provided
        if (listingData.pricing_options && Array.isArray(listingData.pricing_options)) {
          await pricingOptionModel.createMultiple(id, listingData.pricing_options, connection);
        }
        
        // Handle property details if this is a property listing
        if (listingData.listing_type === 'property') {
          const propertyDetails = listingData.property_details ? { ...listingData.property_details } : {};
          
          // Add individual property fields that might be at the root level
          if (listingData.property_type) propertyDetails.property_type = listingData.property_type;
          if (listingData.max_guests) propertyDetails.max_guests = listingData.max_guests;
          if (listingData.bedrooms) propertyDetails.bedrooms = listingData.bedrooms;
          if (listingData.beds) propertyDetails.beds = listingData.beds;
          if (listingData.bathrooms) propertyDetails.bathrooms = listingData.bathrooms;
          if (listingData.room_type) propertyDetails.room_type = listingData.room_type;
          if (listingData.min_nights) propertyDetails.min_nights = listingData.min_nights;
          if (listingData.max_nights) propertyDetails.max_nights = listingData.max_nights;
          
          // Check if property details exist
          const [existingPropertyDetails] = await connection.query(
            'SELECT listing_id FROM listing_property_details WHERE listing_id = ?',
            [id]
          );
          
          if (Object.keys(propertyDetails).length > 0) {
            if (existingPropertyDetails.length > 0) {
              // Update existing property details
              await connection.query(
                'UPDATE listing_property_details SET ? WHERE listing_id = ?',
                [propertyDetails, id]
              );
            } else {
              // Insert new property details
              await connection.query(
                'INSERT INTO listing_property_details SET ?',
                [{ ...propertyDetails, listing_id: id }]
              );
            }
          }
        }
        
        // Handle amenities if provided
        if (listingData.amenities && Array.isArray(listingData.amenities)) {
          // Delete existing amenities
          await connection.query('DELETE FROM listing_amenities WHERE listing_id = ?', [id]);
          
          // Insert new amenities
          if (listingData.amenities.length > 0) {
            for (const amenityId of listingData.amenities) {
              await connection.query(
                'INSERT INTO listing_amenities (listing_id, amenity_id) VALUES (?, ?)',
                [id, amenityId]
              );
            }
          }
        }
        
        // Handle house rules if provided
        if (listingData.house_rules && Array.isArray(listingData.house_rules)) {
          // Delete existing house rules
          await connection.query('DELETE FROM listing_house_rules WHERE listing_id = ?', [id]);
          
          // Insert new house rules
          if (listingData.house_rules.length > 0) {
            for (const rule of listingData.house_rules) {
              await connection.query(
                'INSERT INTO listing_house_rules (listing_id, rule_id, allowed, description) VALUES (?, ?, ?, ?)',
                [id, rule.rule_id, rule.allowed ? 1 : 0, rule.description || null]
              );
            }
          }
        }
        
        // Handle safety features if provided
        if (listingData.safety_features && Array.isArray(listingData.safety_features)) {
          // Delete existing safety features
          await connection.query('DELETE FROM listing_safety_features WHERE listing_id = ?', [id]);
          
          // Insert new safety features
          if (listingData.safety_features.length > 0) {
            for (const featureId of listingData.safety_features) {
              await connection.query(
                'INSERT INTO listing_safety_features (listing_id, feature_id) VALUES (?, ?)',
                [id, featureId]
              );
            }
          }
        }
        
        // Handle vehicle details if this is a vehicle listing
        if (listingData.listing_type === 'vehicle') {
          const carDetails = listingData.car_details ? { ...listingData.car_details } : {};
          
          // Add individual car fields that might be at the root level
          if (listingData.brand) carDetails.brand = listingData.brand;
          if (listingData.model) carDetails.model = listingData.model;
          if (listingData.year) carDetails.year = parseInt(listingData.year);
          if (listingData.transmission) carDetails.transmission = listingData.transmission;
          if (listingData.seats) carDetails.seats = parseInt(listingData.seats);
          if (listingData.fuel_type) carDetails.fuel_type = listingData.fuel_type;
          if (listingData.mileage) carDetails.mileage = parseInt(listingData.mileage);
          
          // Check if car details exist
          const [existingCarDetails] = await connection.query(
            'SELECT listing_id FROM listing_car_details WHERE listing_id = ?',
            [id]
          );
          
          if (Object.keys(carDetails).length > 0) {
            if (existingCarDetails.length > 0) {
              // Update existing car details
              await connection.query(
                'UPDATE listing_car_details SET ? WHERE listing_id = ?',
                [carDetails, id]
              );
            } else {
              // Insert new car details
              await connection.query(
                'INSERT INTO listing_car_details SET ?',
                [{ ...carDetails, listing_id: id }]
              );
            }
          }
        }
        
        // Handle service details if this is a service listing
        if (listingData.listing_type === 'service') {
          const serviceDetails = listingData.service_details ? { ...listingData.service_details } : {};
          
          // Add individual service fields that might be at the root level
          if (listingData.service_type) serviceDetails.service_type = listingData.service_type;
          if (listingData.service_duration) serviceDetails.service_duration = parseInt(listingData.service_duration);
          if (listingData.preparation_time) serviceDetails.preparation_time = parseInt(listingData.preparation_time);
          if (listingData.cleanup_time) serviceDetails.cleanup_time = parseInt(listingData.cleanup_time);
          if (listingData.brings_equipment !== undefined) serviceDetails.brings_equipment = listingData.brings_equipment;
          if (listingData.remote_service !== undefined) serviceDetails.remote_service = listingData.remote_service;
          if (listingData.experience_years) serviceDetails.experience_years = parseInt(listingData.experience_years);
          if (listingData.appointment_required !== undefined) serviceDetails.appointment_required = listingData.appointment_required;
          
          // Check if service details exist
          const [existingServiceDetails] = await connection.query(
            'SELECT listing_id FROM service_details WHERE listing_id = ?',
            [id]
          );
          
          if (Object.keys(serviceDetails).length > 0) {
            if (existingServiceDetails.length > 0) {
              // Update existing service details
              await connection.query(
                'UPDATE service_details SET ? WHERE listing_id = ?',
                [serviceDetails, id]
              );
            } else {
              // Insert new service details
              await connection.query(
                'INSERT INTO service_details SET ?',
                [{ ...serviceDetails, listing_id: id }]
              );
            }
          }
        }
        
        // Handle subscription details if this is a subscription listing
        if (listingData.listing_type === 'subscription') {
          const subscriptionDetails = listingData.subscription_details ? { ...listingData.subscription_details } : {};
          
          // Add individual subscription fields that might be at the root level
          if (listingData.subscription_type) subscriptionDetails.subscription_type = listingData.subscription_type;
          if (listingData.duration_days) subscriptionDetails.duration_days = parseInt(listingData.duration_days);
          if (listingData.recurring !== undefined) subscriptionDetails.recurring = listingData.recurring;
          if (listingData.includes_trainer !== undefined) subscriptionDetails.includes_trainer = listingData.includes_trainer;
          if (listingData.includes_classes !== undefined) subscriptionDetails.includes_classes = listingData.includes_classes;
          if (listingData.max_visits_per_week) subscriptionDetails.max_visits_per_week = parseInt(listingData.max_visits_per_week);
          
          // Check if subscription details exist
          const [existingSubscriptionDetails] = await connection.query(
            'SELECT listing_id FROM listing_subscription_details WHERE listing_id = ?',
            [id]
          );
          
          if (Object.keys(subscriptionDetails).length > 0) {
            if (existingSubscriptionDetails.length > 0) {
              // Update existing subscription details
              await connection.query(
                'UPDATE listing_subscription_details SET ? WHERE listing_id = ?',
                [subscriptionDetails, id]
              );
            } else {
              // Insert new subscription details
              await connection.query(
                'INSERT INTO listing_subscription_details SET ?',
                [{ ...subscriptionDetails, listing_id: id }]
              );
            }
          }
        }
        
        // Handle venue details if this is a venue listing
        if (listingData.listing_type === 'venue') {
          const venueDetails = listingData.venue_details ? { ...listingData.venue_details } : {};
          
          // Add individual venue fields that might be at the root level
          if (listingData.venue_type) venueDetails.venue_type = listingData.venue_type;
          if (listingData.max_capacity) venueDetails.max_capacity = parseInt(listingData.max_capacity);
          if (listingData.indoor_space_sqm) venueDetails.indoor_space_sqm = parseFloat(listingData.indoor_space_sqm);
          if (listingData.outdoor_space_sqm) venueDetails.outdoor_space_sqm = parseFloat(listingData.outdoor_space_sqm);
          if (listingData.has_catering !== undefined) venueDetails.has_catering = listingData.has_catering;
          if (listingData.has_parking !== undefined) venueDetails.has_parking = listingData.has_parking;
          if (listingData.has_sound_system !== undefined) venueDetails.has_sound_system = listingData.has_sound_system;
          if (listingData.has_stage !== undefined) venueDetails.has_stage = listingData.has_stage;
          
          // Check if venue details exist
          const [existingVenueDetails] = await connection.query(
            'SELECT listing_id FROM listing_venue_details WHERE listing_id = ?',
            [id]
          );
          
          if (Object.keys(venueDetails).length > 0) {
            if (existingVenueDetails.length > 0) {
              // Update existing venue details
              await connection.query(
                'UPDATE listing_venue_details SET ? WHERE listing_id = ?',
                [venueDetails, id]
              );
            } else {
              // Insert new venue details
              await connection.query(
                'INSERT INTO listing_venue_details SET ?',
                [{ ...venueDetails, listing_id: id }]
              );
            }
          }
        }
        
        // Handle special pricing if provided
        if (listingData.special_pricing && Array.isArray(listingData.special_pricing)) {
          try {
            // First, delete existing special pricing for this listing
            await connection.query(
              'DELETE FROM special_pricing WHERE listing_id = ?',
              [id]
            );
            
            // Then create new special pricing entries
            if (listingData.special_pricing.length > 0) {
              for (const specialPricingItem of listingData.special_pricing) {
                // Set listing ID for the special pricing
                specialPricingItem.listing_id = id;
                
                // Find the corresponding pricing option ID from the updated listing
                if (specialPricingItem.pricing_option_id && typeof specialPricingItem.pricing_option_id === 'string') {
                  // If it's a client-side ID, find the actual pricing option
                  const [pricingOptionRows] = await connection.query(
                    'SELECT * FROM pricing_options WHERE listing_id = ?',
                    [id]
                  );
                  const matchingOption = pricingOptionRows.find(option => 
                    option.unit_type === (listingData.pricing_options?.find(p => p.id === specialPricingItem.pricing_option_id)?.unit_type)
                  );
                  if (matchingOption) {
                    specialPricingItem.pricing_option_id = matchingOption.id;
                  }
                }
                
                // Convert pricing_option to valid ENUM value
                let pricingOption = 'per_hour'; // default
                if (specialPricingItem.pricing_option_id) {
                  // Use pricing_option_id to determine the correct ENUM value
                  if (specialPricingItem.pricing_option_id === 1 || specialPricingItem.pricing_option_id === 'hour') {
                    pricingOption = 'per_hour';
                  } else if (specialPricingItem.pricing_option_id === 2 || specialPricingItem.pricing_option_id === 'day') {
                    pricingOption = 'per_day';
                  } else if (specialPricingItem.pricing_option_id === 3 || specialPricingItem.pricing_option_id === 'night') {
                    pricingOption = 'per_night';
                  }
                } else if (specialPricingItem.pricing_option) {
                  // Handle direct ENUM values or convert from unit_type
                  const option = specialPricingItem.pricing_option.toLowerCase();
                  if (option === 'per_hour' || option === 'hour') {
                    pricingOption = 'per_hour';
                  } else if (option === 'per_day' || option === 'day') {
                    pricingOption = 'per_day';
                  } else if (option === 'per_night' || option === 'night') {
                    pricingOption = 'per_night';
                  }
                }

                // Create the special pricing entry
                const specialPricingData = {
                  listing_id: specialPricingItem.listing_id,
                  price: specialPricingItem.special_price || specialPricingItem.price,
                  pricing_option: pricingOption,
                  date: specialPricingItem.specific_date || specialPricingItem.date || null,
                  day_of_week: specialPricingItem.day_of_week || null,
                  is_recurring: specialPricingItem.is_recurring || false,
                  start_date: specialPricingItem.recurring_start_date || specialPricingItem.start_date || null,
                  end_date: specialPricingItem.recurring_end_date || specialPricingItem.end_date || null,
                  reason: specialPricingItem.reason || ''
                };
                await specialPricingModel.create(specialPricingData, connection);
              }
            }
          } catch (specialPricingError) {
            console.error('Error updating special pricing:', specialPricingError);
            // Don't fail the entire request if special pricing fails
          }
        }
        
        // Get the updated listing
        const [updatedListingRows] = await connection.query(
          'SELECT * FROM listings WHERE id = ?',
          [id]
        );
        const updatedListing = updatedListingRows[0];
        
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
      let start_datetime, end_datetime, booking_period;
      
      // Handle both GET and POST requests
      if (req.method === 'GET') {
        start_datetime = req.query.start_datetime || req.query.start_date;
        end_datetime = req.query.end_datetime || req.query.end_date;
        booking_period = req.query.booking_period;
      } else {
        // POST method
        start_datetime = req.body.start_datetime || req.body.start_date;
        end_datetime = req.body.end_datetime || req.body.end_date;
        booking_period = req.body.booking_period;
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
      
      // CRITICAL FIX: For day/night listings with booking_period, check specific slot availability
      if (booking_period && ['morning', 'day', 'night'].includes(booking_period)) {
        // Get the listing to check its unit_type
        const listing = await listingModel.getById(id);
        if (!listing) {
          return res.status(404).json({
            status: 'error',
            message: 'Listing not found'
          });
        }
        
        // For day/night listings, check if the specific period is available
        if (listing.unit_type === 'day' || listing.unit_type === 'night') {
          // Get available slots for the date range
          const { getPublicAvailableSlots } = require('./hostController');
          const startDate = new Date(start_datetime).toISOString().split('T')[0];
          const endDate = new Date(end_datetime).toISOString().split('T')[0];
          
          try {
            const availableSlots = await getPublicAvailableSlots(id, startDate, endDate);
            
            // Check if any slot matches the requested booking period
            const hasMatchingSlot = availableSlots.some(slot => {
              // Check if slot covers the requested time period
              const slotStart = new Date(slot.start_datetime);
              const slotEnd = new Date(slot.end_datetime);
              const requestStart = new Date(start_datetime);
              const requestEnd = new Date(end_datetime);
              
              // Slot must cover the entire requested period
              const coversTimeRange = slotStart <= requestStart && slotEnd >= requestEnd;
              
              // For booking_period matching, check slot_type or unit_type
              let periodMatches = false;
              if (booking_period === 'morning' || booking_period === 'day') {
                // Check unit_type for day bookings (slot_type is always 'regular' now)
                periodMatches = slot.unit_type === 'day';
              } else if (booking_period === 'night') {
                // Check unit_type for night bookings (slot_type is always 'regular' now)
                periodMatches = slot.unit_type === 'night';
              }
              
              return coversTimeRange && periodMatches;
            });
            
            return res.status(200).json({
              status: 'success',
              data: {
                is_available: hasMatchingSlot
              }
            });
          } catch (slotError) {
            console.error('Error checking slot availability:', slotError);
            // Fall back to basic availability check
          }
        }
      }
            
      const isAvailable = await listingModel.checkAvailability(id, start_datetime, end_datetime, booking_period);
      
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
  },

  /**
   * Get availability for a listing on a specific date
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getAvailability(req, res, next) {
    try {
      const { id } = req.params;
      const { date } = req.query;
      
      if (!date) {
        return next(badRequest('Date parameter is required'));
      }
      
      // Validate date format
      const targetDate = new Date(date);
      if (isNaN(targetDate.getTime())) {
        return next(badRequest('Invalid date format'));
      }
      
      // Check if listing exists
      const listing = await listingModel.getById(id);
      if (!listing) {
        return next(notFound('Listing not found'));
      }
      
      // Get availability mode for this listing
      const [listingSettings] = await db.query(
        'SELECT availability_mode FROM listing_settings WHERE listing_id = ?',
        [id]
      );
      
      const availabilityMode = listingSettings?.availability_mode || 'available-by-default';
      
      // Format date for database query (YYYY-MM-DD)
      const formattedDate = targetDate.toISOString().split('T')[0];
      
      // Get availability data for the specific date
      const availabilityData = await db.query(
        'SELECT * FROM availability WHERE listing_id = ? AND date = ? AND is_available = TRUE ORDER BY start_time ASC',
        [id, formattedDate]
      );
      
      // Get existing bookings for the specific date to filter out booked time slots
      const existingBookings = await db.query(
        `SELECT start_datetime, end_datetime FROM bookings 
         WHERE listing_id = ? AND status IN ('pending', 'confirmed', 'completed') 
         AND DATE(start_datetime) <= ? AND DATE(end_datetime) >= ?`,
        [id, formattedDate, formattedDate]
      );
      
      // Helper function to check if a time slot overlaps with any booking
      const isTimeSlotBooked = (slotStart, slotEnd) => {
        return existingBookings.some(booking => {
          const bookingStart = new Date(booking.start_datetime);
          const bookingEnd = new Date(booking.end_datetime);
          const slotStartTime = new Date(slotStart);
          const slotEndTime = new Date(slotEnd);
          
          // Check for any overlap between slot and booking
          return slotStartTime < bookingEnd && slotEndTime > bookingStart;
        });
      };
      
      // Format the availability data into time slots and filter out booked ones
      const timeSlots = availabilityData
        .map(slot => {
          const startTime = slot.start_time;
          const endTime = slot.end_time;
          
          // Create full datetime strings
          const startDateTime = `${formattedDate}T${startTime}`;
          const endDateTime = slot.is_overnight && slot.end_date 
            ? `${slot.end_date}T${endTime}`
            : `${formattedDate}T${endTime}`;
          
          return {
            id: slot.id,
            start_time: startTime,
            end_time: endTime,
            start_datetime: startDateTime,
            end_datetime: endDateTime,
            is_overnight: slot.is_overnight || false,
            is_available: slot.is_available
          };
        })
        .filter(slot => {
          // Filter out time slots that are already booked
          return !isTimeSlotBooked(slot.start_datetime, slot.end_datetime);
        });
      
      res.status(200).json({
        status: 'success',
        data: {
          date: formattedDate,
          availability_mode: availabilityMode,
          time_slots: timeSlots
        }
      });
    } catch (error) {
      console.error('Error getting availability:', error);
      next(serverError('Failed to get availability'));
    }
  },

  /**
   * Calculate unified pricing for a listing based on duration
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async calculateUnifiedPricing(req, res, next) {
    try {
      const { id } = req.params;
      const { start_datetime, end_datetime, unit_type } = req.body;

      if (!start_datetime || !end_datetime) {
        return next(badRequest('Start and end datetime are required'));
      }

      // Get listing with pricing options
      const listing = await listingModel.getById(id);

      const startDate = new Date(start_datetime);
      const endDate = new Date(end_datetime);

      // Allow any start/end datetime combination - no validation needed

      // Calculate unified pricing based on duration
      let unifiedPricing = {};
      
      if (listing.pricing_options && listing.pricing_options.length > 0) {
        // Find the appropriate pricing option
        const targetUnitType = unit_type || listing.unit_type;
        const pricingOption = listing.pricing_options.find(option => 
          option.unit_type === targetUnitType && option.is_default
        ) || listing.pricing_options.find(option => 
          option.unit_type === targetUnitType
        ) || listing.pricing_options.find(option => option.is_default) || listing.pricing_options[0];

        // Calculate time difference based on unit type
        let timeDiffMs = endDate - startDate;
        let requestedUnits = 0;
        
        switch (pricingOption.unit_type) {
          case 'hour':
          case 'session':
            requestedUnits = Math.ceil(timeDiffMs / (1000 * 60 * 60));
            break;
          case 'day':
          case 'night':
            requestedUnits = Math.ceil(timeDiffMs / (1000 * 60 * 60 * 24));
            break;
          case 'week':
            requestedUnits = Math.ceil(timeDiffMs / (1000 * 60 * 60 * 24 * 7));
            break;
          case 'month':
            requestedUnits = Math.ceil(timeDiffMs / (1000 * 60 * 60 * 24 * 30));
            break;
          default:
            requestedUnits = Math.ceil(timeDiffMs / (1000 * 60 * 60));
        }

        // For unified pricing, we treat the price as the total for the duration
        // If user requests time that fits within one duration block, they pay the unified price
        // If they need more, they pay for additional blocks
        const durationBlocks = Math.max(
          Math.ceil(requestedUnits / pricingOption.duration),
          pricingOption.minimum_units || 1
        );

        // Check maximum units constraint
        if (pricingOption.maximum_units && durationBlocks > pricingOption.maximum_units) {
          return next(badRequest(`Maximum ${pricingOption.maximum_units} ${pricingOption.unit_type} blocks allowed`));
        }

        // Calculate unified pricing - price is for the entire duration, not per unit
        const totalPrice = durationBlocks * pricingOption.price;
        const effectiveDuration = durationBlocks * pricingOption.duration;
        
        unifiedPricing = {
          pricingOption: pricingOption,
          unifiedPrice: pricingOption.price, // Price for the entire duration block
          unifiedDuration: pricingOption.duration, // Duration of one block
          blocksNeeded: durationBlocks,
          totalPrice: totalPrice, // Total for all blocks needed
          effectiveDuration: effectiveDuration, // Total duration covered
          pricePerUnit: pricingOption.price / pricingOption.duration, // For display only
          unitType: pricingOption.unit_type,
          minimumUnits: pricingOption.minimum_units || 1,
          maximumUnits: pricingOption.maximum_units,
          requestedUnits: requestedUnits
        };
      } else {
        // Fallback to legacy pricing
        return next(badRequest('No pricing options available for this listing'));
      }

      // Calculate confirmation fee (10%)
      const confirmationFeePercent = 10;
      const confirmationFee = unifiedPricing.totalPrice * (confirmationFeePercent / 100);

      res.status(200).json({
        status: 'success',
        data: {
          ...unifiedPricing,
          confirmationFee,
          confirmationFeePercent,
          finalTotal: unifiedPricing.totalPrice
        }
      });
    } catch (error) {
      console.error('Error calculating unified pricing:', error);
      next(error);
    }
  },

  /**
   * Get available time slots for a listing for public users (using same logic as host calendar)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getPublicAvailableSlots(req, res, next) {
    try {
      const { id } = req.params;
      const { start_date, end_date } = req.query;
      
      // Validate required parameters
      if (!start_date || !end_date) {
        return res.status(400).json({
          status: 'error',
          message: 'start_date and end_date are required'
        });
      }
      
      // Check if listing exists and get its details
      const [listing] = await db.query(
        'SELECT * FROM listings WHERE id = ? AND active = 1',
        [id]
      );
      
      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found or not active'
        });
      }
      
      // Import the getPublicAvailableSlots function from hostController which already handles duration-based splitting
      const { getPublicAvailableSlots } = require('./hostController');
      
      // Get available slots using the enhanced public logic that handles slot duration correctly
      const availableSlots = await getPublicAvailableSlots(id, start_date, end_date);
      
      res.status(200).json({
        status: 'success',
        results: availableSlots.length,
        data: availableSlots
      });
    } catch (error) {
      console.error('Error getting public available slots:', error);
      next(serverError('Failed to get available slots'));
    }
  },

  /**
   * Get reservations for a listing for public users (for calendar display)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getPublicReservations(req, res, next) {
    try {
      const { id } = req.params;
      const { start_date, end_date } = req.query;
      
      // Check if listing exists
      const [listing] = await db.query(
        'SELECT * FROM listings WHERE id = ? AND active = 1',
        [id]
      );
      
      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found or not active'
        });
      }
      
      // Get date range for filtering
      let startDateTime, endDateTime;
      if (start_date && end_date) {
        startDateTime = `${start_date} 00:00:00`;
        endDateTime = `${end_date} 23:59:59`;
      } else {
        // Default to next 90 days
        const today = new Date();
        const futureDate = new Date(today);
        futureDate.setDate(today.getDate() + 90);
        startDateTime = `${today.toISOString().split('T')[0]} 00:00:00`;
        endDateTime = `${futureDate.toISOString().split('T')[0]} 23:59:59`;
      }
      
      // Import toMySQLDateTime helper function from hostController
      const { toMySQLDateTime } = require('./hostController');
      
      // Get confirmed and pending bookings (don't show guest details for privacy)
      const reservations = await db.query(`
        SELECT DISTINCT b.id, b.start_datetime as check_in_date, b.end_datetime as check_out_date, 
               b.status, b.created_at
        FROM bookings b
        WHERE b.listing_id = ? 
        AND b.status IN ('pending', 'confirmed', 'completed')
        AND b.start_datetime < ?
        AND b.end_datetime > ?
        ORDER BY b.start_datetime ASC
      `, [id, endDateTime, startDateTime]);
      
      // Format reservations for frontend (same format as host calendar)
      const formattedReservations = reservations.map(booking => {
        // Convert to consistent MySQL datetime format without timezone issues
        let startDate, endDate;
        
        if (booking.check_in_date instanceof Date) {
          startDate = toMySQLDateTime(booking.check_in_date).replace(' ', 'T');
        } else {
          // Convert MySQL datetime format to ISO format without Z suffix
          startDate = typeof booking.check_in_date === 'string' ? 
            booking.check_in_date.replace(' ', 'T').replace('Z', '') : booking.check_in_date;
        }
        
        if (booking.check_out_date instanceof Date) {
          endDate = toMySQLDateTime(booking.check_out_date).replace(' ', 'T');
        } else {
          // Convert MySQL datetime format to ISO format without Z suffix
          endDate = typeof booking.check_out_date === 'string' ? 
            booking.check_out_date.replace(' ', 'T').replace('Z', '') : booking.check_out_date;
        }
        
        return {
          id: booking.id,
          type: 'reservation',
          start_datetime: startDate.replace('T', ' '),
          end_datetime: endDate.replace('T', ' '),
          status: booking.status
        };
      });
      
      res.status(200).json({
        status: 'success',
        results: formattedReservations.length,
        data: formattedReservations
      });
    } catch (error) {
      console.error('Error getting public reservations:', error);
      next(serverError('Failed to get reservations'));
    }
  },

  /**
   * Get blocked dates for a listing for public users
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getPublicBlockedDates(req, res, next) {
    try {
      const { id } = req.params;
      const { start_date, end_date } = req.query;
      
      // Check if listing exists
      const [listing] = await db.query(
        'SELECT * FROM listings WHERE id = ? AND active = 1',
        [id]
      );
      
      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found or not active'
        });
      }
      
      // Get date range for filtering
      let startDateTime, endDateTime;
      if (start_date && end_date) {
        startDateTime = `${start_date} 00:00:00`;
        endDateTime = `${end_date} 23:59:59`;
      } else {
        // Default to next 90 days
        const today = new Date();
        const futureDate = new Date(today);
        futureDate.setDate(today.getDate() + 90);
        startDateTime = `${today.toISOString().split('T')[0]} 00:00:00`;
        endDateTime = `${futureDate.toISOString().split('T')[0]} 23:59:59`;
      }
      
      // Import toMySQLDateTime helper function from hostController
      const { toMySQLDateTime } = require('./hostController');
      
      // Get blocked dates
      const blockedDates = await db.query(`
        SELECT bd.id, bd.start_datetime, bd.end_datetime, bd.reason, bd.created_at
        FROM blocked_dates bd
        WHERE bd.listing_id = ?
        AND bd.start_datetime < ?
        AND bd.end_datetime > ?
        ORDER BY bd.start_datetime ASC
      `, [id, endDateTime, startDateTime]);
      
      // Format blocked dates for frontend (same format as host calendar)
      const formattedBlockedDates = blockedDates.map(blocked => {
        // Convert to consistent MySQL datetime format without timezone issues
        let startDate, endDate;
        
        if (blocked.start_datetime instanceof Date) {
          startDate = toMySQLDateTime(blocked.start_datetime).replace(' ', 'T');
        } else {
          // Convert MySQL datetime format to ISO format without Z suffix
          startDate = typeof blocked.start_datetime === 'string' ? 
            blocked.start_datetime.replace(' ', 'T').replace('Z', '') : blocked.start_datetime;
        }
        
        if (blocked.end_datetime instanceof Date) {
          endDate = toMySQLDateTime(blocked.end_datetime).replace(' ', 'T');
        } else {
          // Convert MySQL datetime format to ISO format without Z suffix
          endDate = typeof blocked.end_datetime === 'string' ? 
            blocked.end_datetime.replace(' ', 'T').replace('Z', '') : blocked.end_datetime;
        }
        
        return {
          id: blocked.id,
          type: 'blocked',
          start_datetime: startDate.replace('T', ' '),
          end_datetime: endDate.replace('T', ' '),
          reason: blocked.reason || 'Blocked'
        };
      });
      
      res.status(200).json({
        status: 'success',
        results: formattedBlockedDates.length,
        data: formattedBlockedDates
      });
    } catch (error) {
      console.error('Error getting public blocked dates:', error);
      next(serverError('Failed to get blocked dates'));
    }
  },

  /**
   * Get availability mode for a listing for public users
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getPublicAvailabilityMode(req, res, next) {
    try {
      const { id } = req.params;
      
      // Check if listing exists
      const [listing] = await db.query(
        'SELECT * FROM listings WHERE id = ? AND active = 1',
        [id]
      );
      
      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found or not active'
        });
      }
      
      // Get availability mode
      const [availabilitySettings] = await db.query(
        'SELECT availability_mode FROM listing_settings WHERE listing_id = ?',
        [id]
      );
      
      const mode = availabilitySettings?.availability_mode || 'available-by-default';
      
      res.status(200).json({
        status: 'success',
        data: {
          mode
        }
      });
    } catch (error) {
      console.error('Error getting availability mode:', error);
      next(serverError('Failed to get availability mode'));
    }
  },

  /**
   * Calculate smart pricing for a listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async calculateSmartPricing(req, res, next) {
    try {
      const { id } = req.params;
      const { start_datetime, end_datetime, unit_type } = req.body;

      if (!start_datetime || !end_datetime) {
        return next(badRequest('Start and end datetime are required'));
      }

      // Get listing with pricing options
      const listing = await listingModel.getById(id);

      const startDate = new Date(start_datetime);
      const endDate = new Date(end_datetime);

      // Allow any start/end datetime combination - no validation needed

      // Calculate smart pricing
      const smartPricing = smartPricingUtils.calculateSmartPrice(
        listing, 
        startDate, 
        endDate, 
        unit_type
      );

      // Apply special pricing if available
      const bookingModel = require('../models/bookingModel');
      const finalPrice = await bookingModel.calculatePriceWithSpecialPricing(
        id,
        startDate,
        endDate,
        smartPricing
      );

      // Calculate confirmation fee (10%)
      const confirmationFeePercent = 10;
      const confirmationFee = finalPrice * (confirmationFeePercent / 100);

      res.status(200).json({
        status: 'success',
        data: {
          pricingOption: smartPricing.pricingOption,
          unitsNeeded: smartPricing.unitsNeeded,
          totalUnits: smartPricing.totalUnits,
          basePrice: finalPrice,
          confirmationFee,
          totalPrice: finalPrice,
          pricePerUnit: smartPricing.pricePerUnit,
          unitType: smartPricing.unitType,
          duration: smartPricing.duration,
          minimumUnits: smartPricing.minimumUnits,
          maximumUnits: smartPricing.maximumUnits,
          effectiveDuration: smartPricing.effectiveDuration,
          constraints: smartPricingUtils.getDurationConstraints(smartPricing.pricingOption)
        }
      });
    } catch (error) {
      console.error('Error calculating smart pricing:', error);
      next(error);
    }
  }
};

module.exports = listingController;