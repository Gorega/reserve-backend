const db = require('../config/database');
const { notFound, badRequest } = require('../utils/errorHandler');
const pricingOptionModel = require('./pricingOptionModel');

/**
 * Listing Model
 * Handles all database operations for listings
 */
const listingModel = {
  /**
   * Get all listings with optional filtering
   * @param {Object} filters - Optional filters
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Array>} - List of listings
   */
  async getAll(filters = {}, page = 1, limit = 10) {
    try {
      const offset = (page - 1) * limit;
      
      // Determine if we need to join with property details tables based on filters
      const needsPropertyDetailsJoin = filters.max_guests || filters.bedrooms || filters.beds || filters.bathrooms || filters.room_type;
      const needsCarDetailsJoin = filters.category_id === 2; // Assuming category_id 2 is for car rentals
      const needsServiceDetailsJoin = filters.category_id !== 1 && filters.category_id !== 2; // Not accommodations or cars
      
      let query = `
        SELECT l.*, c.name as category_name, c.translated_name as category_translated_name, 
               u.name as host_name, u.profile_image as host_image,
               pc.id as parent_category_id, pc.name as parent_category_name, 
               pc.translated_name as parent_category_translated_name,
               (SELECT image_url FROM listing_photos WHERE listing_id = l.id AND is_cover = 1 LIMIT 1) as cover_photo
        FROM listings l
        JOIN users u ON l.user_id = u.id
        JOIN categories c ON l.category_id = c.id
        LEFT JOIN categories pc ON c.parent_id = pc.id
      `;
      
      // Add joins for property details if needed
      if (needsPropertyDetailsJoin) {
        query += `
          LEFT JOIN listing_property_details lpd ON l.id = lpd.listing_id
        `;
      }
      
      // Add joins for car details if needed
      if (needsCarDetailsJoin) {
        query += `
          LEFT JOIN listing_car_details lcd ON l.id = lcd.listing_id
        `;
      }
      
      // Add joins for service details if needed
      if (needsServiceDetailsJoin) {
        query += `
          LEFT JOIN service_details lsd ON l.id = lsd.listing_id
        `;
      }
      
      // Start WHERE clause
      query += ` WHERE l.active = 1`;
      
      const params = [];
      
      // Add filters if provided
      if (Object.keys(filters).length > 0) {
        const filterConditions = [];
        
        // Handle combined search filter (searches in both title and location)
        if (filters.search) {
          filterConditions.push('(l.title LIKE ? OR l.location LIKE ? OR l.description LIKE ?)');
          params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
        }
        
        // Handle category filtering - can be direct category_id or main_category_id
        if (filters.category_id) {
          // Check if this is a main category with subcategories
          if (filters.include_subcategories) {
            // If include_subcategories is true, include listings from subcategories
            filterConditions.push('(c.id = ? OR c.parent_id = ?)');
            params.push(filters.category_id, filters.category_id);
          } else {
            // Otherwise, only exact category match
            filterConditions.push('l.category_id = ?');
            params.push(filters.category_id);
          }
        }
        
        // Filter by main_category_id (parent_id)
        if (filters.main_category_id) {
          filterConditions.push('pc.id = ?');
          params.push(filters.main_category_id);
        }
        
        if (filters.title) {
          filterConditions.push('l.title LIKE ?');
          params.push(`%${filters.title}%`);
        }
        
        if (filters.location) {
          filterConditions.push('l.location LIKE ?');
          params.push(`%${filters.location}%`);
        }
        
        if (filters.min_price) {
          if (filters.is_hourly) {
            filterConditions.push('l.price_per_hour >= ?');
          } else {
            filterConditions.push('l.price_per_day >= ?');
          }
          params.push(parseFloat(filters.min_price));
        }
        
        if (filters.max_price) {
          if (filters.is_hourly) {
            filterConditions.push('l.price_per_hour <= ?');
          } else {
            filterConditions.push('l.price_per_day <= ?');
          }
          params.push(parseFloat(filters.max_price));
        }
        
        if (filters.is_hourly !== undefined) {
          filterConditions.push('l.is_hourly = ?');
          params.push(filters.is_hourly ? 1 : 0);
        }
        
        if (filters.user_id) {
          filterConditions.push('l.user_id = ?');
          params.push(filters.user_id);
        }
        
        if (filters.min_rating) {
          filterConditions.push('l.rating >= ?');
          params.push(parseFloat(filters.min_rating));
        }
        
        // Property detail filters - now using the joined table
        if (filters.max_guests) {
          filterConditions.push('lpd.max_guests >= ?');
          params.push(parseInt(filters.max_guests));
        }
        
        if (filters.bedrooms) {
          filterConditions.push('lpd.bedrooms >= ?');
          params.push(parseInt(filters.bedrooms));
        }
        
        if (filters.beds) {
          filterConditions.push('lpd.beds >= ?');
          params.push(parseInt(filters.beds));
        }
        
        if (filters.bathrooms) {
          filterConditions.push('lpd.bathrooms >= ?');
          params.push(parseFloat(filters.bathrooms));
        }
        
        if (filters.room_type) {
          filterConditions.push('lpd.room_type = ?');
          params.push(filters.room_type);
        }
        
        if (filters.instant_booking !== undefined) {
          filterConditions.push('l.instant_booking = ?');
          params.push(filters.instant_booking ? 1 : 0);
        }
        
        if (filters.cancellation_policy) {
          filterConditions.push('l.cancellation_policy = ?');
          params.push(filters.cancellation_policy);
        }
        
        // Date availability filtering
        if (filters.start_date && filters.end_date) {
          const startDate = new Date(filters.start_date);
          const endDate = new Date(filters.end_date);
          
          if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
            // Format dates for MySQL
            // If the input is just a date (YYYY-MM-DD), add time components
            let formattedStartDate, formattedEndDate;
            
            // Check if the date strings include time components
            if (!filters.start_date.includes('T') && !filters.start_date.includes(' ')) {
              // Date only format - set to beginning of day
              formattedStartDate = `${filters.start_date} 00:00:00`;
            } else {
              // Already has time component
              formattedStartDate = startDate.toISOString().slice(0, 19).replace('T', ' ');
            }
            
            if (!filters.end_date.includes('T') && !filters.end_date.includes(' ')) {
              // Date only format - set to end of day
              formattedEndDate = `${filters.end_date} 23:59:59`;
            } else {
              // Already has time component
              formattedEndDate = endDate.toISOString().slice(0, 19).replace('T', ' ');
            }
                        
            // Exclude listings that have blocked dates or bookings during the requested period
            filterConditions.push(`
              l.id NOT IN (
                SELECT DISTINCT listing_id FROM blocked_dates 
                WHERE (
                  (start_datetime <= ? AND end_datetime >= ?) OR
                  (start_datetime <= ? AND end_datetime >= ?) OR
                  (start_datetime >= ? AND end_datetime <= ?)
                )
              )
            `);
            params.push(formattedEndDate, formattedStartDate, formattedStartDate, formattedEndDate, formattedStartDate, formattedEndDate);
            
            // Also exclude listings with bookings during this period
            filterConditions.push(`
              l.id NOT IN (
                SELECT DISTINCT listing_id FROM bookings 
                WHERE status IN ('pending', 'confirmed', 'completed') 
                AND (
                  (start_datetime <= ? AND end_datetime >= ?) OR
                  (start_datetime <= ? AND end_datetime >= ?) OR
                  (start_datetime >= ? AND end_datetime <= ?)
                )
              )
            `);
            params.push(formattedEndDate, formattedStartDate, formattedStartDate, formattedEndDate, formattedStartDate, formattedEndDate);
            
            // Handle listings with blocked-by-default availability mode - USING AVAILABLE_SLOTS TABLE
            filterConditions.push(`
              NOT EXISTS (
                SELECT 1 FROM listing_settings 
                WHERE listing_id = l.id 
                AND availability_mode = 'blocked-by-default'
                AND NOT EXISTS (
                  SELECT 1 FROM available_slots 
                  WHERE listing_id = l.id 
                  AND is_available = 1
                  AND start_datetime <= ? 
                  AND end_datetime >= ?
                )
              )
            `);
            params.push(formattedEndDate, formattedStartDate);
          }
        }
        
        if (filters.amenities) {
          const amenityIds = Array.isArray(filters.amenities) 
            ? filters.amenities 
            : [filters.amenities];
          
          // Count how many of the requested amenities each listing has
          query += `
            AND l.id IN (
              SELECT la.listing_id 
              FROM listing_amenities la 
              WHERE la.amenity_id IN (${amenityIds.map(() => '?').join(',')})
              GROUP BY la.listing_id
              HAVING COUNT(DISTINCT la.amenity_id) = ${amenityIds.length}
            )
          `;
          params.push(...amenityIds);
        }
        
        if (filterConditions.length > 0) {
          query += ' AND ' + filterConditions.join(' AND ');
        }
      }
      
      // Add sorting
      if (filters.sort_by) {
        let sortField = 'l.created_at';
        let sortOrder = 'DESC';
        
        switch (filters.sort_by) {
          case 'price_low':
            sortField = filters.is_hourly ? 'l.price_per_hour' : 'l.price_per_day';
            sortOrder = 'ASC';
            break;
          case 'price_high':
            sortField = filters.is_hourly ? 'l.price_per_hour' : 'l.price_per_day';
            sortOrder = 'DESC';
            break;
          case 'rating':
            sortField = 'l.rating';
            sortOrder = 'DESC';
            break;
          case 'newest':
            sortField = 'l.created_at';
            sortOrder = 'DESC';
            break;
        }
        
        query += ` ORDER BY ${sortField} ${sortOrder}`;
      } else {
      query += ' ORDER BY l.created_at DESC';
      }
      
      // Add pagination - ensure limit and offset are integers
      const limitInt = parseInt(limit);
      const offsetInt = parseInt(offset);
      query += ` LIMIT ${limitInt} OFFSET ${offsetInt}`;
      
      const listings = await db.query(query, params);
      
      // Add pricing options with unified duration pricing for each listing
      if (listings.length > 0) {
        const listingIds = listings.map(l => l.id);
        let photosMap = {};
        let amenitiesMap = {};
        if (listingIds.length > 0 && limit <= 5000) {
          const placeholders = listingIds.map(() => '?').join(',');
          const photosRows = await db.query(
            `SELECT listing_id, id, image_url, is_cover
             FROM listing_photos
             WHERE listing_id IN (${placeholders})
             ORDER BY is_cover DESC, id ASC`,
            listingIds
          );
          for (const row of photosRows) {
            if (!photosMap[row.listing_id]) photosMap[row.listing_id] = [];
            photosMap[row.listing_id].push({ id: row.id, image_url: row.image_url, is_cover: row.is_cover });
          }
          const amenitiesRows = await db.query(
            `SELECT la.listing_id, a.*
             FROM listing_amenities la
             JOIN amenities a ON la.amenity_id = a.id
             WHERE la.listing_id IN (${placeholders})`,
            listingIds
          );
          for (const row of amenitiesRows) {
            if (!amenitiesMap[row.listing_id]) amenitiesMap[row.listing_id] = [];
            amenitiesMap[row.listing_id].push(row);
          }
        }
        for (const listing of listings) {
          // Get pricing options for this listing
          listing.pricing_options = await pricingOptionModel.getByListingId(listing.id);
          
          // Add unified pricing information to the main listing object
          if (listing.pricing_options && listing.pricing_options.length > 0) {
            const defaultOption = listing.pricing_options.find(option => option.is_default) || listing.pricing_options[0];
            listing.price_duration = defaultOption.duration || 1;
            listing.price_unit_type = defaultOption.unit_type || listing.unit_type;
            
            // Calculate unified price for the duration period
            listing.unified_price = defaultOption.price;
            listing.unified_duration = defaultOption.duration || 1;
            listing.price_per_unit = listing.unified_price / listing.unified_duration;
          }
          listing.photos = photosMap[listing.id] || [];
          listing.amenities = amenitiesMap[listing.id] || [];
        }
      }
      
      return listings;
    } catch (error) {
      console.error('Error getting listings:', error);
      throw error;
    }
  },
  
  /**
   * Get listing by ID
   * @param {number} id - Listing ID
   * @returns {Promise<Object>} - Listing object with all details
   */
  async getById(id) {
    try {
      // Get main listing data
      const query = `
        SELECT l.*, c.name as category_name, c.translated_name as category_translated_name, 
               u.name as host_name, u.profile_image as host_image,
               u.id as host_id, u.is_provider,
               pc.id as parent_category_id, pc.name as parent_category_name, 
               pc.translated_name as parent_category_translated_name
        FROM listings l
        JOIN users u ON l.user_id = u.id
        JOIN categories c ON l.category_id = c.id
        LEFT JOIN categories pc ON c.parent_id = pc.id
        WHERE l.id = ?
      `;
      
      const listings = await db.query(query, [id]);
      
      if (listings.length === 0) {
        throw notFound('Listing not found');
      }
      
      const listing = listings[0];
      
      // Get listing photos
      const photosQuery = `
        SELECT id, image_url, is_cover
        FROM listing_photos
        WHERE listing_id = ?
        ORDER BY is_cover DESC, id ASC
      `;
      
      listing.photos = await db.query(photosQuery, [id]);
      
      // Get pricing options with duration
      listing.pricing_options = await pricingOptionModel.getByListingId(id);
      
      // Add unified pricing information to the main listing object
      if (listing.pricing_options && listing.pricing_options.length > 0) {
        const defaultOption = listing.pricing_options.find(option => option.is_default) || listing.pricing_options[0];
        listing.price_duration = defaultOption.duration || 1;
        listing.price_unit_type = defaultOption.unit_type || listing.unit_type;
        
        // Calculate unified price for the duration period
        listing.unified_price = defaultOption.price;
        listing.unified_duration = defaultOption.duration || 1;
        listing.price_per_unit = listing.unified_price / listing.unified_duration;
      }
      
      // Get special pricing for this listing
      const specialPricingModel = require('./specialPricingModel');
      listing.special_pricing = await specialPricingModel.getByListingId(id);
      
      // Get type-specific details based on listing_type
      if (listing.listing_type === 'property') {
        const propertyQuery = `
          SELECT * FROM listing_property_details
          WHERE listing_id = ?
        `;
        const propertyDetails = await db.query(propertyQuery, [id]);
        if (propertyDetails.length > 0) {
          const pd = propertyDetails[0];
          if (pd.max_guests != null) pd.max_guests = Math.round(parseFloat(pd.max_guests));
          if (pd.bedrooms != null) pd.bedrooms = Math.round(parseFloat(pd.bedrooms));
          if (pd.beds != null) pd.beds = Math.round(parseFloat(pd.beds));
          if (pd.bathrooms != null) pd.bathrooms = Math.round(parseFloat(pd.bathrooms));
          if (pd.min_nights != null) pd.min_nights = Math.round(parseFloat(pd.min_nights));
          if (pd.max_nights != null) pd.max_nights = Math.round(parseFloat(pd.max_nights));
          listing.property_details = pd;
        }
      } else if (listing.listing_type === 'vehicle') {
        const carQuery = `
          SELECT * FROM listing_car_details
          WHERE listing_id = ?
        `;
        const carDetails = await db.query(carQuery, [id]);
        if (carDetails.length > 0) {
          listing.car_details = carDetails[0];
        }
      } else if (listing.listing_type === 'service') {
        const serviceQuery = `
          SELECT * FROM service_details
          WHERE listing_id = ?
        `;
        const serviceDetails = await db.query(serviceQuery, [id]);
        if (serviceDetails.length > 0) {
          listing.service_details = serviceDetails[0];
        }
      } else if (listing.listing_type === 'venue') {
        const venueQuery = `
          SELECT * FROM listing_venue_details
          WHERE listing_id = ?
        `;
        const venueDetails = await db.query(venueQuery, [id]);
        if (venueDetails.length > 0) {
          listing.venue_details = venueDetails[0];
        }
      } else if (listing.listing_type === 'subscription') {
        const subscriptionQuery = `
          SELECT * FROM listing_subscription_details
          WHERE listing_id = ?
        `;
        const subscriptionDetails = await db.query(subscriptionQuery, [id]);
        if (subscriptionDetails.length > 0) {
          listing.subscription_details = subscriptionDetails[0];
        }
      }
      
      // Get amenities
      const amenitiesQuery = `
        SELECT a.*
        FROM listing_amenities la
        JOIN amenities a ON la.amenity_id = a.id
        WHERE la.listing_id = ?
      `;
      
      listing.amenities = await db.query(amenitiesQuery, [id]);
      
      // Get house rules
      const rulesQuery = `
        SELECT hr.id, hr.name, hr.icon, lhr.allowed, lhr.description
        FROM listing_house_rules lhr
        JOIN house_rules hr ON lhr.rule_id = hr.id
        WHERE lhr.listing_id = ?
      `;
      
      listing.house_rules = await db.query(rulesQuery, [id]);
      
      // Get safety features
      const featuresQuery = `
        SELECT sf.*
        FROM listing_safety_features lsf
        JOIN safety_features sf ON lsf.feature_id = sf.id
        WHERE lsf.listing_id = ?
      `;
      
      listing.safety_features = await db.query(featuresQuery, [id]);
      
      // Get listing settings
      const settingsQuery = `
        SELECT * FROM listing_settings
        WHERE listing_id = ?
      `;
      
      const settings = await db.query(settingsQuery, [id]);
      if (settings.length > 0) {
        listing.settings = settings[0];
      }
      
      // Get host profile
      const hostProfileQuery = `
        SELECT * FROM host_profiles
        WHERE user_id = ?
      `;
      
      const hostProfiles = await db.query(hostProfileQuery, [listing.user_id]);
      if (hostProfiles.length > 0) {
        listing.host_profile = hostProfiles[0];
      }
      
      // Get reviews for the listing
      const reviewsQuery = `
        SELECT r.*, u.name as reviewer_name, u.profile_image as reviewer_image
        FROM reviews r
        JOIN users u ON r.reviewer_id = u.id
        WHERE r.listing_id = ?
        ORDER BY r.created_at DESC
      `;
      
      listing.reviews = await db.query(reviewsQuery, [id]);
      
      return listing;
    } catch (error) {
      console.error('Error getting listing by ID:', error);
      throw error;
    }
  },
  
  /**
   * Create a new listing
   * @param {Object} listingData - Listing data
   * @returns {Promise<Object>} - Created listing
   */
  async create(listingData) {
    try {
      // Extract listing data
      const {
        user_id,
        category_id,
        listing_type,
        title,
        description,
        price_per_hour,
        price_per_day,
        price_per_half_night,
        unit_type,
        location,
        latitude,
        longitude,
        instant_booking,
        cancellation_policy,
        
        // Property details
        property_type,
        max_guests,
        bedrooms,
        beds,
        bathrooms,
        room_type,
        min_nights,
        max_nights,
        
        // Car details
        brand,
        model,
        year,
        transmission,
        seats,
        fuel_type,
        mileage,
        
        // Service details
        service_type,
        service_duration,
        preparation_time,
        cleanup_time,
        brings_equipment,
        remote_service,
        experience_years,
        appointment_required,
        
        // Venue details
        venue_type,
        max_capacity,
        indoor_space_sqm,
        outdoor_space_sqm,
        has_catering,
        has_parking,
        has_sound_system,
        has_stage,
        
        // Subscription details
        subscription_type,
        duration_days,
        recurring,
        includes_trainer,
        includes_classes,
        max_visits_per_week,
        
        // Other data
        photos,
        amenities,
        house_rules,
        safety_features
      } = listingData;
      
      // Validate required fields
      if (!user_id || !category_id || !listing_type || !title || !description) {
        throw badRequest('Missing required fields');
      }
      
      // Start a transaction
      const connection = await db.getPool().getConnection();
      await connection.beginTransaction();
      
      try {
        // Determine booking_type based on unit_type
        let booking_type = 'hourly'; // Default
        if (unit_type === 'hour') {
          booking_type = 'hourly';
        } else if (unit_type === 'day') {
          booking_type = 'daily';
        } else if (unit_type === 'night') {
          booking_type = 'night';
        } else if (unit_type === 'appointment') {
          booking_type = 'appointment';
        }
        
        // Determine slot_duration based on unit_type
        let slot_duration = null;
        if (unit_type === 'hour') {
          slot_duration = listingData.slot_duration ? parseInt(listingData.slot_duration, 10) : 60;
        } else if (unit_type === 'appointment') {
          slot_duration = listingData.slot_duration ? parseInt(listingData.slot_duration, 10) : 30;
        }
        
        // Insert listing
        const listingResult = await connection.query(
          `INSERT INTO listings (
            user_id, category_id, listing_type, title, description, price_per_hour, price_per_day, price_per_half_night,
            unit_type, is_hourly, location, latitude, longitude, instant_booking, cancellation_policy, slot_duration, booking_type
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            user_id,
            category_id,
            listing_type,
            title,
            description,
            price_per_hour || null,
            price_per_day || null,
            price_per_half_night || null,
            unit_type || 'hour',
            unit_type === 'hour' || unit_type === 'session' || unit_type === 'appointment' ? 1 : 0,
            location,
            latitude,
            longitude,
            instant_booking ? 1 : 0,
            cancellation_policy || 'moderate',
            slot_duration,
            booking_type
          ]
        );
        
        const listingId = listingResult[0].insertId;
        
        // Insert pricing options if provided
        if (listingData.pricing_options && Array.isArray(listingData.pricing_options) && listingData.pricing_options.length > 0) {
          await pricingOptionModel.createMultiple(listingId, listingData.pricing_options, connection);
        } 
        // Create default pricing options based on legacy fields if no pricing options provided
        else if (price_per_hour || price_per_day || price_per_half_night) {
          const pricingOptions = [];
          
          if (price_per_hour) {
            pricingOptions.push({
              price: price_per_hour,
              unit_type: 'hour',
              duration: 1,
              is_default: unit_type === 'hour'
            });
          }
          
          if (price_per_day) {
            pricingOptions.push({
              price: price_per_day,
              unit_type: 'day',
              duration: 1,
              is_default: unit_type === 'day'
            });
          }
          
          if (price_per_half_night) {
            pricingOptions.push({
              price: price_per_half_night,
              unit_type: 'night',
              duration: 1,
              is_default: unit_type === 'night'
            });
          }
          
          if (pricingOptions.length > 0) {
            await pricingOptionModel.createMultiple(listingId, pricingOptions, connection);
          }
        }
        
        // Insert type-specific details based on listing_type
        if (listing_type === 'property') {
          // Check if property details already exist
          const [existingPropertyDetails] = await connection.query(
            'SELECT listing_id FROM listing_property_details WHERE listing_id = ?',
            [listingId]
          );
          
          if (existingPropertyDetails.length === 0) {
            // Insert property details only if they don't exist
            const mg = max_guests != null ? Math.round(parseFloat(max_guests)) : null;
            const br = bedrooms != null ? Math.round(parseFloat(bedrooms)) : null;
            const bd = beds != null ? Math.round(parseFloat(beds)) : null;
            const ba = bathrooms != null ? Math.round(parseFloat(bathrooms)) : null;
            const mn = min_nights != null ? Math.round(parseFloat(min_nights)) : 1;
            const mxn = max_nights != null ? Math.round(parseFloat(max_nights)) : null;
            await connection.query(
              `INSERT INTO listing_property_details (
                listing_id, max_guests, bedrooms, beds, bathrooms, property_type, room_type, min_nights, max_nights
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                listingId,
                mg,
                br,
                bd,
                ba,
                property_type || 'other',
                room_type || null,
                mn,
                mxn
              ]
            );
          }
        } else if (listing_type === 'vehicle') {
          // Check if vehicle details already exist
          const [existingVehicleDetails] = await connection.query(
            'SELECT listing_id FROM listing_car_details WHERE listing_id = ?',
            [listingId]
          );
          
          if (existingVehicleDetails.length === 0) {
            // Insert car details only if they don't exist
            await connection.query(
              `INSERT INTO listing_car_details (
                listing_id, brand, model, year, transmission, seats, fuel_type, mileage
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                listingId,
                brand || null,
                model || null,
                year || null,
                transmission || null,
                seats || null,
                fuel_type || null,
                mileage || null
              ]
            );
          }
        } else if (listing_type === 'service') {
          // Check if service details already exist
          const [existingServiceDetails] = await connection.query(
            'SELECT listing_id FROM service_details WHERE listing_id = ?',
            [listingId]
          );
          
          if (existingServiceDetails.length === 0) {
            // Insert service details only if they don't exist
            await connection.query(
              `INSERT INTO service_details (
                listing_id, service_type, service_duration, preparation_time, cleanup_time, 
                brings_equipment, remote_service, experience_years, appointment_required
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                listingId,
                service_type,
                service_duration || null,
                preparation_time || null,
                cleanup_time || null,
                brings_equipment ? 1 : 0,
                remote_service ? 1 : 0,
                experience_years || null,
                appointment_required ? 1 : 0
              ]
            );
          }
        } else if (listing_type === 'venue') {
          // Check if venue details already exist
          const [existingVenueDetails] = await connection.query(
            'SELECT listing_id FROM listing_venue_details WHERE listing_id = ?',
            [listingId]
          );
          
          if (existingVenueDetails.length === 0) {
            // Insert venue details only if they don't exist
            await connection.query(
              `INSERT INTO listing_venue_details (
                listing_id, venue_type, max_capacity, indoor_space_sqm, outdoor_space_sqm,
                has_catering, has_parking, has_sound_system, has_stage
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                listingId,
                venue_type,
                max_capacity || null,
                indoor_space_sqm || null,
                outdoor_space_sqm || null,
                has_catering ? 1 : 0,
                has_parking ? 1 : 0,
                has_sound_system ? 1 : 0,
                has_stage ? 1 : 0
              ]
            );
          }
        } else if (listing_type === 'subscription') {
          // Check if subscription details already exist
          const [existingSubscriptionDetails] = await connection.query(
            'SELECT listing_id FROM listing_subscription_details WHERE listing_id = ?',
            [listingId]
          );
          
          if (existingSubscriptionDetails.length === 0) {
            // Insert subscription details only if they don't exist
            await connection.query(
              `INSERT INTO listing_subscription_details (
                listing_id, subscription_type, duration_days, recurring,
                includes_trainer, includes_classes, max_visits_per_week
              ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                listingId,
                subscription_type,
                duration_days || null,
                recurring ? 1 : 0,
                includes_trainer ? 1 : 0,
                includes_classes ? 1 : 0,
                max_visits_per_week || null
              ]
            );
          }
        }
        
        // Insert photos if provided
        if (photos && photos.length > 0) {
          for (const photo of photos) {
            // Check if this photo is already associated with the listing
            const [existingPhoto] = await connection.query(
              'SELECT * FROM listing_photos WHERE listing_id = ? AND image_url = ?',
              [listingId, photo.image_url]
            );
            
            // Only insert if the photo doesn't already exist for this listing
            if (existingPhoto.length === 0) {
              await connection.query(
                `INSERT INTO listing_photos (listing_id, image_url, is_cover) VALUES (?, ?, ?)`,
                [listingId, photo.image_url, photo.is_cover ? 1 : 0]
              );
            }
          }
        }
        
        // Insert amenities if provided
        if (amenities && amenities.length > 0) {
          for (const amenityId of amenities) {
            // Check if this amenity is already associated with the listing
            const [existingAmenity] = await connection.query(
              'SELECT * FROM listing_amenities WHERE listing_id = ? AND amenity_id = ?',
              [listingId, amenityId]
            );
            
            // Only insert if the amenity doesn't already exist for this listing
            if (existingAmenity.length === 0) {
              await connection.query(
                `INSERT INTO listing_amenities (listing_id, amenity_id) VALUES (?, ?)`,
                [listingId, amenityId]
              );
            }
          }
        }
        
        // Insert house rules if provided
        if (house_rules && house_rules.length > 0) {
          for (const rule of house_rules) {
            // Check if this rule is already associated with the listing
            const [existingRule] = await connection.query(
              'SELECT * FROM listing_house_rules WHERE listing_id = ? AND rule_id = ?',
              [listingId, rule.rule_id]
            );
            
            if (existingRule.length === 0) {
              // Only insert if the rule doesn't already exist for this listing
              await connection.query(
                `INSERT INTO listing_house_rules (listing_id, rule_id, allowed, description) 
                VALUES (?, ?, ?, ?)`,
                [listingId, rule.rule_id, rule.allowed ? 1 : 0, rule.description || null]
              );
            } else {
              // Update existing rule if it already exists
              await connection.query(
                `UPDATE listing_house_rules SET allowed = ?, description = ? 
                WHERE listing_id = ? AND rule_id = ?`,
                [rule.allowed ? 1 : 0, rule.description || null, listingId, rule.rule_id]
              );
            }
          }
        }
        
        // Insert safety features if provided
        if (safety_features && safety_features.length > 0) {
          for (const featureId of safety_features) {
            // Check if this safety feature is already associated with the listing
            const [existingFeature] = await connection.query(
              'SELECT * FROM listing_safety_features WHERE listing_id = ? AND feature_id = ?',
              [listingId, featureId]
            );
            
            // Only insert if the safety feature doesn't already exist for this listing
            if (existingFeature.length === 0) {
              await connection.query(
                `INSERT INTO listing_safety_features (listing_id, feature_id) VALUES (?, ?)`,
                [listingId, featureId]
              );
            }
          }
        }

        // Insert special pricing if provided
        if (listingData.special_pricing && Array.isArray(listingData.special_pricing) && listingData.special_pricing.length > 0) {
          const specialPricingModel = require('./specialPricingModel');
          
          for (const specialPricing of listingData.special_pricing) {
            try {
              // Set the listing ID
              specialPricing.listing_id = listingId;
              
              // Create special pricing entry
              await specialPricingModel.create(specialPricing, connection);
            } catch (error) {
              console.error('Error creating special pricing:', error);
              // Continue with other entries even if one fails
            }
          }
        }
        
        // Check if listing settings already exist
        const [existingSettings] = await connection.query(
          'SELECT listing_id FROM listing_settings WHERE listing_id = ?',
          [listingId]
        );
        
        if (existingSettings.length === 0) {
          // Create default listing settings only if they don't exist
          await connection.query(
            `INSERT INTO listing_settings (
              listing_id, availability_mode, min_advance_booking_hours, max_advance_booking_days, 
              instant_booking_enabled
            ) VALUES (?, ?, ?, ?, ?)`,
            [
              listingId,
              'blocked-by-default',
              24,
              365,
              instant_booking ? 1 : 0
            ]
          );
        }
        
        // Commit transaction
        await connection.commit();
        
        // Return the created listing
        return this.getById(listingId);
      } catch (error) {
        // Rollback transaction on error
        await connection.rollback();
        console.error('Error creating listing:', error);
        throw error;
      } finally {
        // Release connection
        connection.release();
      }
    } catch (error) {
      console.error('Error creating listing:', error);
      throw error;
    }
  },
  
  /**
   * Update a listing
   * @param {number} id - Listing ID
   * @param {Object} listingData - Listing data to update
   * @returns {Promise<Object>} - Updated listing
   */
  async update(id, listingData) {
    // Initialize connection outside try block so it's available in finally
    let connection = null;
    
    try {
      // Check if listing exists
      const existingListing = await db.getById('listings', id);
      
      if (!existingListing) {
        throw notFound('Listing not found');
      }
      
      // Start a transaction
      connection = await db.getPool().getConnection();
      await connection.beginTransaction();
      
      try {
        // Extract related data
        const { 
          photos, 
          amenities, 
          house_rules, 
          safety_features,
          property_details = {},
          car_details = {},
          service_details = {},
          subscription_details = {},
          venue_details = {},
          blocked_dates,
          pricing_options
        } = listingData;
        
        // Define the fields that belong to the main listings table
        const validListingFields = [
          'user_id', 'category_id', 'listing_type', 'title', 'description',
          'price_per_hour', 'price_per_day', 'price_per_half_night', 'unit_type',
          'is_hourly', 'location', 'latitude', 'longitude', 'instant_booking',
          'cancellation_policy', 'rating', 'review_count', 'active'
        ];
        
        // Create a clean mainListingData object with only valid fields
        const mainListingData = {};
        Object.keys(listingData).forEach(key => {
          if (validListingFields.includes(key)) {
            mainListingData[key] = listingData[key];
          }
        });
        
        // Set booking_type based on unit_type if unit_type is provided
        if (listingData.unit_type) {
          if (listingData.unit_type === 'hour') {
            mainListingData.booking_type = 'hourly';
          } else if (listingData.unit_type === 'day') {
            mainListingData.booking_type = 'daily';
          } else if (listingData.unit_type === 'night') {
            mainListingData.booking_type = 'night';
          } else if (listingData.unit_type === 'appointment') {
            mainListingData.booking_type = 'appointment';
          }
        }
        
        // Handle slot_duration for hour and appointment unit types
        if (listingData.unit_type === 'hour' || listingData.unit_type === 'appointment') {
          if (listingData.slot_duration) {
            mainListingData.slot_duration = parseInt(listingData.slot_duration, 10);
          } else if (listingData.unit_type === 'hour') {
            mainListingData.slot_duration = 60; // Default for hourly
          } else if (listingData.unit_type === 'appointment') {
            mainListingData.slot_duration = 30; // Default for appointment
          }
        }
        
        // Process property-specific fields
        if (listingData.property_type) property_details.property_type = listingData.property_type;
        if (listingData.max_guests) property_details.max_guests = Math.round(parseFloat(listingData.max_guests));
        if (listingData.bedrooms) property_details.bedrooms = Math.round(parseFloat(listingData.bedrooms));
        if (listingData.beds) property_details.beds = Math.round(parseFloat(listingData.beds));
        if (listingData.bathrooms) property_details.bathrooms = Math.round(parseFloat(listingData.bathrooms));
        if (listingData.room_type) property_details.room_type = listingData.room_type;
        if (listingData.min_nights) property_details.min_nights = Math.round(parseFloat(listingData.min_nights));
        if (listingData.max_nights) property_details.max_nights = Math.round(parseFloat(listingData.max_nights));
        
        // Process car-specific fields
        if (listingData.brand) car_details.brand = listingData.brand;
        if (listingData.model) car_details.model = listingData.model;
        if (listingData.year) car_details.year = listingData.year;
        if (listingData.transmission) car_details.transmission = listingData.transmission;
        if (listingData.seats) car_details.seats = listingData.seats;
        if (listingData.fuel_type) car_details.fuel_type = listingData.fuel_type;
        if (listingData.mileage) car_details.mileage = listingData.mileage;
        
        // Process service-specific fields
        if (listingData.service_type) service_details.service_type = listingData.service_type;
        if (listingData.service_duration) service_details.service_duration = listingData.service_duration;
        if (listingData.preparation_time) service_details.preparation_time = listingData.preparation_time;
        if (listingData.cleanup_time) service_details.cleanup_time = listingData.cleanup_time;
        if (listingData.brings_equipment !== undefined) service_details.brings_equipment = listingData.brings_equipment;
        if (listingData.remote_service !== undefined) service_details.remote_service = listingData.remote_service;
        if (listingData.experience_years) service_details.experience_years = listingData.experience_years;
        if (listingData.appointment_required !== undefined) service_details.appointment_required = listingData.appointment_required;
        
        // Process subscription-specific fields
        if (listingData.subscription_type) subscription_details.subscription_type = listingData.subscription_type;
        if (listingData.duration_days) subscription_details.duration_days = listingData.duration_days;
        if (listingData.recurring !== undefined) subscription_details.recurring = listingData.recurring;
        if (listingData.includes_trainer !== undefined) subscription_details.includes_trainer = listingData.includes_trainer;
        if (listingData.includes_classes !== undefined) subscription_details.includes_classes = listingData.includes_classes;
        if (listingData.max_visits_per_week) subscription_details.max_visits_per_week = listingData.max_visits_per_week;
        
        // Process venue-specific fields
        if (listingData.venue_type) venue_details.venue_type = listingData.venue_type;
        if (listingData.max_capacity) venue_details.max_capacity = listingData.max_capacity;
        if (listingData.indoor_space_sqm) venue_details.indoor_space_sqm = listingData.indoor_space_sqm;
        if (listingData.outdoor_space_sqm) venue_details.outdoor_space_sqm = listingData.outdoor_space_sqm;
        if (listingData.has_catering !== undefined) venue_details.has_catering = listingData.has_catering;
        if (listingData.has_parking !== undefined) venue_details.has_parking = listingData.has_parking;
        if (listingData.has_sound_system !== undefined) venue_details.has_sound_system = listingData.has_sound_system;
        if (listingData.has_stage !== undefined) venue_details.has_stage = listingData.has_stage;
        
              // Update main listing if there are fields to update
      if (Object.keys(mainListingData).length > 0) {
        try {
          await connection.query(
            'UPDATE listings SET ? WHERE id = ?',
            [mainListingData, id]
          );
        } catch (error) {
          console.error('Error updating listing main data:', error);
          throw error;
        }
      }
        
        // Check if listing type has changed
        const listingType = mainListingData.listing_type || existingListing.listing_type;
        const hasListingTypeChanged = mainListingData.listing_type && mainListingData.listing_type !== existingListing.listing_type;
        
        // Update photos if provided
        if (photos) {
          // Delete existing photos
          await connection.query('DELETE FROM listing_photos WHERE listing_id = ?', [id]);
          
          // Insert new photos
          if (photos.length > 0) {
            for (let i = 0; i < photos.length; i++) {
              const photo = photos[i];
              await connection.query(
                'INSERT INTO listing_photos (listing_id, image_url, is_cover) VALUES (?, ?, ?)',
                [id, photo.image_url, i === 0 ? 1 : 0] // First photo is cover by default
              );
            }
          }
        }
        
        // Update amenities if provided
        if (amenities) {
          // Delete existing amenities
          await connection.query('DELETE FROM listing_amenities WHERE listing_id = ?', [id]);
          
          // Insert new amenities
          if (amenities.length > 0) {
            for (const amenityId of amenities) {
              await connection.query(
                'INSERT INTO listing_amenities (listing_id, amenity_id) VALUES (?, ?)',
                [id, amenityId]
              );
            }
          }
        }
        
        // Update house rules if provided
        if (house_rules) {
          // Delete existing house rules
          await connection.query('DELETE FROM listing_house_rules WHERE listing_id = ?', [id]);
          
          // Insert new house rules
          if (house_rules.length > 0) {
            for (const rule of house_rules) {
              await connection.query(
                'INSERT INTO listing_house_rules (listing_id, rule_id, allowed, description) VALUES (?, ?, ?, ?)',
                [id, rule.rule_id, rule.allowed, rule.description || null]
              );
            }
          }
        }
        
        // Update safety features if provided
        if (safety_features) {
          // Delete existing safety features
          await connection.query('DELETE FROM listing_safety_features WHERE listing_id = ?', [id]);
          
          // Insert new safety features
          if (safety_features.length > 0) {
            for (const featureId of safety_features) {
              await connection.query(
                'INSERT INTO listing_safety_features (listing_id, feature_id) VALUES (?, ?)',
                [id, featureId]
              );
            }
          }
        }
        
        // Get the category ID from existing listing or updated data
        const categoryId = mainListingData.category_id || existingListing.category_id;
        
        // Determine which detail tables to update based on listing type
        const isProperty = listingType === 'property';
        const isVehicle = listingType === 'vehicle';
        const isService = listingType === 'service';
        const isVenue = listingType === 'venue';
        const isSubscription = listingType === 'subscription';
        
        // Update property details if provided (for accommodations)
        if (Object.keys(property_details).length > 0 && isProperty) {
          // Check if property details exist
          const [existingPropertyDetails] = await connection.query(
            'SELECT listing_id FROM listing_property_details WHERE listing_id = ?',
            [id]
          );
          
          if (existingPropertyDetails.length > 0) {
            // Update existing property details
            await connection.query(
              'UPDATE listing_property_details SET ? WHERE listing_id = ?',
              [property_details, id]
            );
          } else {
            // Insert new property details
            await connection.query(
              'INSERT INTO listing_property_details SET ?',
              [{ ...property_details, listing_id: id }]
            );
          }
        }
        
        // Update car details if provided (for car rentals)
        if (Object.keys(car_details).length > 0 && isVehicle) {
          // Check if car details exist
          const [existingCarDetails] = await connection.query(
            'SELECT listing_id FROM listing_car_details WHERE listing_id = ?',
            [id]
          );
          
          if (existingCarDetails.length > 0) {
            // Update existing car details
            await connection.query(
              'UPDATE listing_car_details SET ? WHERE listing_id = ?',
              [car_details, id]
            );
          } else {
            // Insert new car details
            await connection.query(
              'INSERT INTO listing_car_details SET ?',
              [{ ...car_details, listing_id: id }]
            );
          }
        }
        
        // Update service details if provided (for services)
        if (Object.keys(service_details).length > 0 && isService) {
          // Check if service details exist
          const [existingServiceDetails] = await connection.query(
            'SELECT listing_id FROM service_details WHERE listing_id = ?',
            [id]
          );
          
          if (existingServiceDetails.length > 0) {
            // Update existing service details
            await connection.query(
              'UPDATE service_details SET ? WHERE listing_id = ?',
              [service_details, id]
            );
          } else {
            // Insert new service details
            await connection.query(
              'INSERT INTO service_details SET ?',
              [{ ...service_details, listing_id: id }]
            );
          }
        }
        
        // Update venue details if provided (for venues)
        if (Object.keys(venue_details).length > 0 && isVenue) {
          // Check if venue details exist
          const [existingVenueDetails] = await connection.query(
            'SELECT listing_id FROM listing_venue_details WHERE listing_id = ?',
            [id]
          );
          
          if (existingVenueDetails.length > 0) {
            // Update existing venue details
            await connection.query(
              'UPDATE listing_venue_details SET ? WHERE listing_id = ?',
              [venue_details, id]
            );
          } else {
            // Insert new venue details
            await connection.query(
              'INSERT INTO listing_venue_details SET ?',
              [{ ...venue_details, listing_id: id }]
            );
          }
        }
        
        // Update subscription details if provided (for subscriptions)
        if (Object.keys(subscription_details).length > 0 && isSubscription) {
          // Check if subscription details exist
          const [existingSubscriptionDetails] = await connection.query(
            'SELECT listing_id FROM listing_subscription_details WHERE listing_id = ?',
            [id]
          );
          
          if (existingSubscriptionDetails.length > 0) {
            // Update existing subscription details
            await connection.query(
              'UPDATE listing_subscription_details SET ? WHERE listing_id = ?',
              [subscription_details, id]
            );
          } else {
            // Insert new subscription details
            await connection.query(
              'INSERT INTO listing_subscription_details SET ?',
              [{ ...subscription_details, listing_id: id }]
            );
          }
        }
        
        // Handle listing type changes - clean up old type-specific details
        if (hasListingTypeChanged) {
          // Remove details from tables that no longer apply to the new listing type
          if (!isProperty) {
            await connection.query('DELETE FROM listing_property_details WHERE listing_id = ?', [id]);
          }
          if (!isVehicle) {
            await connection.query('DELETE FROM listing_car_details WHERE listing_id = ?', [id]);
          }
          if (!isService) {
            await connection.query('DELETE FROM service_details WHERE listing_id = ?', [id]);
          }
          if (!isVenue) {
            await connection.query('DELETE FROM listing_venue_details WHERE listing_id = ?', [id]);
          }
          if (!isSubscription) {
            await connection.query('DELETE FROM listing_subscription_details WHERE listing_id = ?', [id]);
          }
        }
        
        // Update blocked dates if provided
        if (blocked_dates) {
          // Delete existing blocked dates
          await connection.query('DELETE FROM blocked_dates WHERE listing_id = ?', [id]);
          
          // Insert new blocked dates
          if (blocked_dates.length > 0) {
            for (const blockedDate of blocked_dates) {
              await connection.query(
                'INSERT INTO blocked_dates (listing_id, start_datetime, end_datetime, reason) VALUES (?, ?, ?, ?)',
                [id, blockedDate.start_datetime, blockedDate.end_datetime, blockedDate.reason || null]
              );
            }
          }
        }
        
        // Process pricing options if provided
        if (pricing_options && Array.isArray(pricing_options)) {
          // Use the pricing option model to handle pricing options
          // Pass the connection to ensure it's part of the same transaction
          await pricingOptionModel.createMultiple(id, pricing_options, connection);
        }

        // Process special pricing if provided
        if (listingData.special_pricing && Array.isArray(listingData.special_pricing)) {
          const specialPricingModel = require('./specialPricingModel');
          
          // Delete existing special pricing for this listing
          await connection.query('DELETE FROM special_pricing WHERE listing_id = ?', [id]);
          
          // Insert new special pricing entries
          for (const specialPricing of listingData.special_pricing) {
            try {
              // Set the listing ID
              specialPricing.listing_id = id;
              
              // Create special pricing entry
              await specialPricingModel.create(specialPricing, connection);
            } catch (error) {
              console.error('Error creating special pricing during update:', error);
              // Continue with other entries even if one fails
            }
          }
        }
        
        // Commit transaction
        await connection.commit();
        
        // Get the updated listing with all details
        const updatedListing = await this.getById(id);
        
        return updatedListing;
      } catch (error) {
        // Rollback transaction on error
        if (connection) {
          try {
            await connection.rollback();
          } catch (rollbackError) {
            console.error('Error rolling back transaction:', rollbackError);
          }
        }
        throw error;
      } finally {
        if (connection) {
          connection.release();
        }
      }
    } catch (error) {
      console.error('Error updating listing:', error);
      throw error;
    }
  },
  
  /**
   * Delete a listing
   * @param {number} id - Listing ID
   * @returns {Promise<boolean>} - Success status
   */
  async delete(id) {
    try {
      // Check if listing exists
      const listing = await db.getById('listings', id);
      
      if (!listing) {
        throw notFound('Listing not found');
      }
      
      // Check if listing has active bookings
      const bookings = await db.query(
        `SELECT id FROM bookings 
         WHERE listing_id = ? AND status IN ('pending', 'confirmed')`,
        [id]
      );
      
      if (bookings.length > 0) {
        throw badRequest('Cannot delete listing with active bookings');
      }
      
      // Delete listing (this will cascade delete related data)
      await db.remove('listings', id);
      
      return true;
    } catch (error) {
      console.error('Error deleting listing:', error);
      throw error;
    }
  },
  
  /**
   * Get amenities list
   * @returns {Promise<Array>} - List of amenities
   */
  async getAmenities() {
    try {
      const amenities = await db.query('SELECT * FROM amenities ORDER BY category, name');
      return amenities;
    } catch (error) {
      console.error('Error getting amenities:', error);
      throw error;
    }
  },
  
  /**
   * Get house rules list
   * @returns {Promise<Array>} - List of house rules
   */
  async getHouseRules() {
    try {
      const rules = await db.query('SELECT * FROM house_rules ORDER BY name');
      return rules;
    } catch (error) {
      console.error('Error getting house rules:', error);
      throw error;
    }
  },
  
  /**
   * Get safety features list
   * @returns {Promise<Array>} - List of safety features
   */
  async getSafetyFeatures() {
    try {
      const features = await db.query('SELECT * FROM safety_features ORDER BY name');
      return features;
    } catch (error) {
      console.error('Error getting safety features:', error);
      throw error;
    }
  },
  
  /**
   * Get main categories (parent_id is NULL)
   * @returns {Promise<Array>} - List of main categories
   */
  async getMainCategories() {
    try {
      const categories = await db.query('SELECT * FROM categories WHERE parent_id IS NULL ORDER BY id');
      return categories;
    } catch (error) {
      console.error('Error getting main categories:', error);
      throw error;
    }
  },
  
  /**
   * Get subcategories by parent ID
   * @param {number} parentId - Parent category ID
   * @returns {Promise<Array>} - List of subcategories
   */
  async getSubcategories(parentId) {
    try {
      const subcategories = await db.query('SELECT * FROM categories WHERE parent_id = ? ORDER BY name', [parentId]);
      return subcategories;
    } catch (error) {
      console.error('Error getting subcategories:', error);
      throw error;
    }
  },
  
  /**
   * Get category with its parent info
   * @param {number} categoryId - Category ID
   * @returns {Promise<Object>} - Category with parent info
   */
  async getCategoryWithParent(categoryId) {
    try {
      const query = `
        SELECT c.*, p.id as parent_id, p.name as parent_name, p.translated_name as parent_translated_name
        FROM categories c
        LEFT JOIN categories p ON c.parent_id = p.id
        WHERE c.id = ?
      `;
      
      const categories = await db.query(query, [categoryId]);
      
      if (categories.length === 0) {
        throw notFound('Category not found');
      }
      
      return categories[0];
    } catch (error) {
      console.error('Error getting category with parent:', error);
      throw error;
    }
  },
  
  /**
   * Get cancellation policies list
   * @returns {Promise<Array>} - List of cancellation policies
   */
  async getCancellationPolicies() {
    try {
      const policies = await db.query('SELECT * FROM cancellation_policies ORDER BY name');
      return policies;
    } catch (error) {
      console.error('Error getting cancellation policies:', error);
      throw error;
    }
  },
  
  /**
   * Report a listing
   * @param {number} listingId - Listing ID
   * @param {number} userId - User ID
   * @param {Object} reportData - Report data
   * @returns {Promise<Object>} - Created report
   */
  async reportListing(listingId, userId, reportData) {
    try {
      // Check if listing exists
      const listing = await db.getById('listings', listingId);
      
      if (!listing) {
        throw notFound('Listing not found');
      }
      
      // Create report
      const data = {
        listing_id: listingId,
        user_id: userId,
        reason: reportData.reason,
        description: reportData.description
      };
      
      const result = await db.insert('listing_reports', data);
      
      // Get created report
      const report = await db.getById('listing_reports', result.insertId);
      
      return report;
    } catch (error) {
      console.error('Error reporting listing:', error);
      throw error;
    }
  },
  
  /**
   * Check if a listing is available for a given time period
   * @param {number} listingId - Listing ID
   * @param {string} startDatetime - Start datetime in ISO format
   * @param {string} endDatetime - End datetime in ISO format
   * @returns {Promise<boolean>} - True if available, false if not
   */
  async checkAvailability(listingId, startDatetime, endDatetime, bookingPeriod = null) {
    try {
      // Check if listing exists
      const listing = await this.getById(listingId);
      
      if (!listing) {
        throw notFound('Listing not found');
      }
      
      // Format datetime strings for MySQL with proper timezone handling
      const formatDateForMySQL = (dateString) => {
        // If already in MySQL format (YYYY-MM-DD HH:MM:SS), return as-is
        if (dateString.includes(' ') && dateString.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
          return dateString;
        }
        // If just a date (YYYY-MM-DD), add default time
        if (!dateString.includes('T') && !dateString.includes(' ')) {
          return `${dateString} 00:00:00`;
        }
        // If ISO format (YYYY-MM-DDTHH:MM:SS), convert from UTC to local time
        if (dateString.includes('T')) {
          const date = new Date(dateString);
          // Convert to local time by adjusting for timezone offset
          const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
          const year = localDate.getFullYear();
          const month = String(localDate.getMonth() + 1).padStart(2, '0');
          const day = String(localDate.getDate()).padStart(2, '0');
          const hours = String(localDate.getHours()).padStart(2, '0');
          const minutes = String(localDate.getMinutes()).padStart(2, '0');
          const seconds = String(localDate.getSeconds()).padStart(2, '0');
          return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        }
        // Fallback: return as-is
        return dateString;
      };
      
      const formattedStartDatetime = formatDateForMySQL(startDatetime);
      let formattedEndDatetime;

      if (!endDatetime.includes('T') && !endDatetime.includes(' ')) {
        formattedEndDatetime = `${endDatetime} 23:59:59`;
      } else {
        formattedEndDatetime = formatDateForMySQL(endDatetime);
      }
      
      // Get the availability mode for this listing
      const [listingSettings] = await db.query(
        'SELECT availability_mode FROM listing_settings WHERE listing_id = ?',
        [listingId]
      );
      
      const availabilityMode = listingSettings?.availability_mode || 'available-by-default';
      
      // CRITICAL FIX: For day/night/appointment listings, use slot-based availability checking
      if (listing.unit_type === 'day' || listing.unit_type === 'night' || listing.unit_type === 'appointment') {
        // Get available slots for the date range using the same logic as frontend
        const { getPublicAvailableSlots } = require('../controllers/hostController');
        
        // Convert MySQL datetime format to ISO format for Date constructor
        const mysqlToIso = (mysqlDatetime) => {
          if (!mysqlDatetime || typeof mysqlDatetime !== 'string') {
            console.error('🚨 [DEBUG] Invalid mysqlDatetime input:', mysqlDatetime);
            throw new Error('Invalid datetime input for mysqlToIso');
          }
          return mysqlDatetime.replace(' ', 'T') + 'Z';
        };
        
        let startDate, endDate;
        try {
          const startIso = mysqlToIso(formattedStartDatetime);
          const endIso = mysqlToIso(formattedEndDatetime);
          
          const startDateObj = new Date(startIso);
          const endDateObj = new Date(endIso);
          
          if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
            console.error('🚨 [DEBUG] Invalid Date objects created:', {
              startDateObj: startDateObj.toString(),
              endDateObj: endDateObj.toString(),
              startIsValid: !isNaN(startDateObj.getTime()),
              endIsValid: !isNaN(endDateObj.getTime())
            });
            throw new Error('Invalid Date objects created from datetime strings');
          }
          
          startDate = startDateObj.toISOString().split('T')[0];
          endDate = endDateObj.toISOString().split('T')[0];
          
        } catch (dateError) {
          console.error('🚨 [DEBUG] Error in date conversion:', dateError);
          throw dateError;
        }
        
        try {
          const availableSlots = await getPublicAvailableSlots(listingId, startDate, endDate);
          
          if (availableSlots.length === 0) {
            return false;
          }
          
          // For day/night listings with booking_period, check if any slot matches the requested period
          if (bookingPeriod && ['morning', 'day', 'night'].includes(bookingPeriod)) {
            // Check if any slot matches the requested booking period
            const hasMatchingSlot = availableSlots.some(slot => {
              const slotStart = new Date(slot.start_datetime);
              const slotEnd = new Date(slot.end_datetime);
              const requestStart = new Date(formattedStartDatetime);
              const requestEnd = new Date(formattedEndDatetime);
              
              // Slot must cover the entire requested period
              const coversTimeRange = slotStart <= requestStart && slotEnd >= requestEnd;
              
              // For booking_period matching, check unit_type
              let periodMatches = false;
              if (bookingPeriod === 'morning' || bookingPeriod === 'day') {
                // Check unit_type for day bookings
                periodMatches = slot.unit_type === 'day' || listing.unit_type === 'day';
              } else if (bookingPeriod === 'night') {
                // Check unit_type for night bookings
                periodMatches = slot.unit_type === 'night' || listing.unit_type === 'night';
              }
              
              const isMatch = coversTimeRange && periodMatches;
              return isMatch;
            });
            
            return hasMatchingSlot;
          } else {
            // For appointment or when no booking_period specified, just check if there are any available slots
            // that cover the requested time range
            const hasAvailableSlot = availableSlots.some(slot => {
              const slotStart = new Date(slot.start_datetime);
              const slotEnd = new Date(slot.end_datetime);
              const requestStart = new Date(formattedStartDatetime);
              const requestEnd = new Date(formattedEndDatetime);
              
              // Slot must cover the entire requested period
              const coversTimeRange = slotStart <= requestStart && slotEnd >= requestEnd;
              return coversTimeRange;
            });
            
            return hasAvailableSlot;
          }
        } catch (slotError) {
          console.error('Error checking slot availability:', slotError);
          // Fall back to basic availability check below
        }
      }
      
      // CRITICAL FIX: Use the same logic as getPublicAvailableSlots to ensure consistency
      try {        
        // Get all available slots for this listing that might overlap with our booking period
        const availableSlotsQuery = `
          SELECT start_datetime, end_datetime
          FROM available_slots
          WHERE listing_id = ?
          AND is_available = TRUE
          AND (
            (start_datetime <= ? AND end_datetime > ?) OR
            (start_datetime < ? AND end_datetime >= ?) OR
            (start_datetime >= ? AND start_datetime < ?)
          )
          ORDER BY start_datetime
        `;
        
        const availableSlots = await db.query(availableSlotsQuery, [
          listingId,
          formattedStartDatetime, formattedStartDatetime,
          formattedEndDatetime, formattedEndDatetime,
          formattedStartDatetime, formattedEndDatetime
        ]);
        
        if (availableSlots.length === 0) {
          return false;
        }
        
        // Check if any single slot covers the entire booking period
        // Convert booking times back to UTC for proper comparison with slot times
        const bookingStartUTC = new Date(startDatetime); // Original UTC time from frontend
        const bookingEndUTC = new Date(endDatetime); // Original UTC time from frontend
        
        for (const slot of availableSlots) {
          const slotStart = new Date(slot.start_datetime);
          const slotEnd = new Date(slot.end_datetime);
                    
          // Check if the slot covers the entire booking period
          // A slot covers a booking if it starts before or at the booking start time
          // AND ends after or at the booking end time
          const slotStartBeforeBooking = slotStart <= bookingStartUTC;
          const slotEndAfterBooking = slotEnd >= bookingEndUTC;
          const covers = slotStartBeforeBooking && slotEndAfterBooking;
          
          if (covers) {
            // This slot covers the entire booking period, check for booking conflicts
            // CRITICAL FIX: Use proper overlap detection for booking conflicts
            // Two time periods overlap if: start1 < end2 AND start2 < end1
            // But we need to exclude adjacent bookings (where end1 = start2 or end2 = start1)
            const bookingsQuery = `
              SELECT * FROM bookings 
              WHERE listing_id = ? 
              AND status IN ('pending', 'confirmed', 'completed')
              AND start_datetime < ? AND end_datetime > ?
            `;
            
            
            const allPotentialConflicts = await db.query(bookingsQuery, [
              listingId,
              endDatetime,
              startDatetime
            ]);
            
            
            // Filter out adjacent bookings (not actual conflicts)
            const actualConflicts = allPotentialConflicts.filter(booking => {
              const bookingStart = new Date(booking.start_datetime);
              const bookingEnd = new Date(booking.end_datetime);
              const newBookingStart = new Date(startDatetime);
              const newBookingEnd = new Date(endDatetime);
              
              // Check for actual overlap (not just adjacency)
              const hasOverlap = bookingStart < newBookingEnd && bookingEnd > newBookingStart;
              
              return hasOverlap;
            });
            
            const bookings = actualConflicts;
            
            
            if (bookings.length === 0) {
              return true;
            }
          }
        }
                
        // If no single slot covers the period, check for continuous coverage
        const sortedSlots = availableSlots.sort((a, b) => 
          new Date(a.start_datetime) - new Date(b.start_datetime)
        );
        
        let currentCoverageEnd = bookingStartUTC;
        
        for (const slot of sortedSlots) {
          const slotStart = new Date(slot.start_datetime);
          const slotEnd = new Date(slot.end_datetime);
          
          // Skip slots that don't extend our coverage
          if (slotStart > currentCoverageEnd || slotEnd <= currentCoverageEnd) {
            continue;
          }
          
          // If this slot connects to our current coverage
          if (slotStart <= currentCoverageEnd) {
            currentCoverageEnd = new Date(Math.max(currentCoverageEnd.getTime(), slotEnd.getTime()));
            
            // If we've covered the entire booking period
            if (currentCoverageEnd >= bookingEndUTC) {
              // Check for booking conflicts with proper overlap detection
              const bookingsQuery = `
                SELECT * FROM bookings 
                WHERE listing_id = ? 
                AND status IN ('pending', 'confirmed', 'completed')
                AND start_datetime < ? AND end_datetime > ?
              `;
              
              const allPotentialConflicts = await db.query(bookingsQuery, [
                listingId,
                endDatetime,
                startDatetime
              ]);
              
              // Filter out adjacent bookings (not actual conflicts)
              const actualConflicts = allPotentialConflicts.filter(booking => {
                const bookingStart = new Date(booking.start_datetime);
                const bookingEnd = new Date(booking.end_datetime);
                const newBookingStart = new Date(startDatetime);
                const newBookingEnd = new Date(endDatetime);
                
                // Check for actual overlap (not just adjacency)
                return bookingStart < newBookingEnd && bookingEnd > newBookingStart;
              });
              
              return actualConflicts.length === 0;
            }
          }
        }
        
        // If we couldn't find continuous coverage, return false
        return false;
        
      } catch (error) {
        console.error('Error checking available_slots table:', error);
        // If there's an error with the available_slots table, fall back to traditional checking
      }
      
      // If available_slots check didn't work, fall back to traditional availability checking
      if (availabilityMode === 'blocked-by-default') {
        // In blocked-by-default mode, check if dates are explicitly available
        const availabilityQuery = `
          SELECT date FROM availability 
          WHERE listing_id = ? 
          AND is_available = 1
          AND date BETWEEN DATE(?) AND DATE(?)
        `;
        
        const availableDates = await db.query(availabilityQuery, [
          listingId,
          formattedStartDatetime,
          formattedEndDatetime
        ]);
        
        const startDate = new Date(startDatetime);
        const endDate = new Date(endDatetime);
        const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
        
        if (availableDates.length < daysDiff) {
          return false;
        }
      } else {
        // In available-by-default mode, check for blocked dates
        const blockedDatesQuery = `
          SELECT * FROM blocked_dates 
          WHERE listing_id = ? 
          AND (
            (start_datetime <= ? AND end_datetime >= ?) OR
            (start_datetime <= ? AND end_datetime >= ?) OR
            (start_datetime >= ? AND end_datetime <= ?)
          )
        `;
        
        const blockedDates = await db.query(blockedDatesQuery, [
          listingId,
          formattedStartDatetime, formattedStartDatetime,
          formattedEndDatetime, formattedEndDatetime,
          formattedStartDatetime, formattedEndDatetime
        ]);
        
        if (blockedDates.length > 0) {
          return false;
        }
      }
      
      // Check for booking conflicts
      const bookingsQuery = `
        SELECT * FROM bookings 
        WHERE listing_id = ? 
        AND status IN ('pending', 'confirmed', 'completed')
        AND (
          (start_datetime <= ? AND end_datetime >= ?) OR
          (start_datetime <= ? AND end_datetime >= ?) OR
          (start_datetime >= ? AND end_datetime <= ?)
        )
      `;
      
      const bookings = await db.query(bookingsQuery, [
        listingId,
        formattedStartDatetime, formattedStartDatetime,
        formattedEndDatetime, formattedEndDatetime,
        formattedStartDatetime, formattedEndDatetime
      ]);
      
      if (bookings.length > 0) {
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error checking availability:', error);
      throw error;
    }
  },


  
  /**
   * Add a photo to a listing
   * @param {number} listingId - Listing ID
   * @param {string} imageUrl - URL of the image
   * @returns {Promise<Object>} - Added photo object
   */
  async addPhoto(listingId, imageUrl) {
    try {
      // Check if listing exists
      const listing = await db.getById('listings', listingId);
      
      if (!listing) {
        throw notFound('Listing not found');
      }
      
      // Get current photos count
      const photos = await db.query(
        'SELECT COUNT(*) as count FROM listing_photos WHERE listing_id = ?',
        [listingId]
      );
      
      // Determine if this should be the cover photo (first photo is cover)
      const isCover = photos[0].count === 0;
      
      // Insert the photo
      const result = await db.insert('listing_photos', {
        listing_id: listingId,
        image_url: imageUrl,
        is_cover: isCover ? 1 : 0
      });
      
      // Get the inserted photo
      const insertedPhoto = await db.query(
        'SELECT * FROM listing_photos WHERE id = ?',
        [result.insertId]
      );
      
      return insertedPhoto[0];
    } catch (error) {
      console.error('Error adding photo:', error);
      throw error;
    }
  },
  
  /**
   * Delete a photo from a listing
   * @param {number} photoId - Photo ID
   * @returns {Promise<boolean>} - Success status
   */
  async deletePhoto(photoId) {
    try {
      // Check if photo exists
      const photo = await db.query(
        'SELECT * FROM listing_photos WHERE id = ?',
        [photoId]
      );
      
      if (!photo || photo.length === 0) {
        throw notFound('Photo not found');
      }
      
      // Delete the photo
      await db.remove('listing_photos', photoId);
      
      // If the deleted photo was the cover, set another photo as cover
      if (photo[0].is_cover) {
        const remainingPhotos = await db.query(
          'SELECT id FROM listing_photos WHERE listing_id = ? ORDER BY id ASC LIMIT 1',
          [photo[0].listing_id]
        );
        
        if (remainingPhotos && remainingPhotos.length > 0) {
          await db.update('listing_photos', remainingPhotos[0].id, { is_cover: 1 });
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error deleting photo:', error);
      throw error;
    }
  },
  
  /**
   * Set a photo as the cover photo
   * @param {number} photoId - Photo ID
   * @returns {Promise<boolean>} - Success status
   */
  async setCoverPhoto(photoId) {
    try {
      // Check if photo exists
      const photo = await db.query(
        'SELECT * FROM listing_photos WHERE id = ?',
        [photoId]
      );
      
      if (!photo || photo.length === 0) {
        throw notFound('Photo not found');
      }
      
      // Start a transaction
      const connection = await db.getPool().getConnection();
      await connection.beginTransaction();
      
      try {
        // Remove cover flag from all photos of this listing
        await connection.query(
          'UPDATE listing_photos SET is_cover = 0 WHERE listing_id = ?',
          [photo[0].listing_id]
        );
        
        // Set this photo as cover
        await connection.query(
          'UPDATE listing_photos SET is_cover = 1 WHERE id = ?',
          [photoId]
        );
        
        // Commit transaction
        await connection.commit();
        
        return true;
      } catch (error) {
        // Rollback transaction on error
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Error setting cover photo:', error);
      throw error;
    }
  },

  /**
   * Get photos for a listing
   * @param {number} listingId - Listing ID
   * @returns {Promise<Array>} - List of photos
   */
  async getListingPhotos(listingId) {
    try {
      const photos = await db.query(
        'SELECT * FROM listing_photos WHERE listing_id = ? ORDER BY is_cover DESC, id ASC',
        [listingId]
      );
      
      return photos;
    } catch (error) {
      console.error('Error getting listing photos:', error);
      throw error;
    }
  }
};

module.exports = listingModel;
