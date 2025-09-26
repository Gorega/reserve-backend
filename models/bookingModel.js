// This is a fixed version of the bookingModel.js file with proper pricing_option_id support
// Copy the contents of this file to bookingModel.js to fix the syntax errors

const db = require('../config/database');
const { errorHandler, notFound, badRequest } = require('../utils/errorHandler');
const { toUTCDateString } = require('../utils/dateUtils');
const specialPricingModel = require('./specialPricingModel');
const smartPricingUtils = require('../utils/smartPricingUtils');

// Booking model
const bookingModel = {
  /**
   * Get all bookings with filters
   * @param {Object} filters - Filter criteria
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Array>} - Array of bookings
   */
  async getAll(filters = {}, page = 1, limit = 10) {
    try {
      // Calculate offset for pagination
      const offset = (page - 1) * limit;
      
      // Build query
      let query = `
        SELECT b.*,
               u.name as user_name,
               u.email as user_email,
               l.title as listing_title,
               l.price_per_hour,
               l.price_per_day,
               l.unit_type as listing_unit_type,
               l.user_id as provider_id,
               p.id as payment_id,
               p.method as payment_method,
               COALESCE(p.status, b.payment_status) as payment_status_actual,
               (SELECT image_url FROM listing_photos WHERE listing_id = l.id AND is_cover = 1 LIMIT 1) as listing_cover_photo
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        JOIN listings l ON b.listing_id = l.id
        LEFT JOIN payments p ON b.id = p.booking_id AND p.id = (
          SELECT MAX(id) FROM payments WHERE booking_id = b.id
        )
      `;
      
      const queryParams = [];
      
      // Add filters if provided
      if (Object.keys(filters).length > 0) {
        const filterConditions = [];
        
        if (filters.user_id) {
          filterConditions.push('b.user_id = ?');
          queryParams.push(Number(filters.user_id));
        }
        
        if (filters.listing_id) {
          filterConditions.push('b.listing_id = ?');
          queryParams.push(Number(filters.listing_id));
        }
        
        if (filters.provider_id) {
          filterConditions.push('l.user_id = ?');
          queryParams.push(Number(filters.provider_id));
        }
        
        if (filters.user_or_provider_id) {
          filterConditions.push('(b.user_id = ? OR l.user_id = ?)');
          queryParams.push(Number(filters.user_or_provider_id));
          queryParams.push(Number(filters.user_or_provider_id));
        }
        
        if (filters.status) {
          filterConditions.push('b.status = ?');
          queryParams.push(String(filters.status));
        }
        
        if (filters.payment_status) {
          filterConditions.push('b.payment_status = ?');
          queryParams.push(String(filters.payment_status));
        }
        
        if (filters.start_date) {
          filterConditions.push('DATE(b.start_datetime) >= ?');
          queryParams.push(String(filters.start_date));
        }
        
        if (filters.end_date) {
          filterConditions.push('DATE(b.end_datetime) <= ?');
          queryParams.push(String(filters.end_date));
        }
        
        if (filterConditions.length > 0) {
          query += ' WHERE ' + filterConditions.join(' AND ');
        }
      }
      
      // Add order by and pagination
      // Use direct integer values in the query string instead of parameters for LIMIT and OFFSET
      // This avoids the MySQL prepared statement parameter type issues
      query += ` ORDER BY b.created_at DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;
      
      // Execute query
      const bookings = await db.query(query, queryParams);
      
      // Format datetime fields and add unit_type to each booking
      bookings.forEach(booking => {
        // Make sure unit_type is always available
        booking.unit_type = booking.listing_unit_type || 'hour';
        
        // Format datetime fields to YYYY-MM-DD HH:MM:SS
        if (booking.start_datetime) {
          booking.start_datetime = this.formatDateTimeForDisplay(booking.start_datetime);
        }
        if (booking.end_datetime) {
          booking.end_datetime = this.formatDateTimeForDisplay(booking.end_datetime);
        }
        if (booking.deposit_deadline) {
          booking.deposit_deadline = this.formatDateTimeForDisplay(booking.deposit_deadline);
        }
        if (booking.auto_cancel_at) {
          booking.auto_cancel_at = this.formatDateTimeForDisplay(booking.auto_cancel_at);
        }
        if (booking.created_at) {
          booking.created_at = this.formatDateTimeForDisplay(booking.created_at);
        }
        if (booking.updated_at) {
          booking.updated_at = this.formatDateTimeForDisplay(booking.updated_at);
        }
        if (booking.served_at) {
          booking.served_at = this.formatDateTimeForDisplay(booking.served_at);
        }
      });
      
      return bookings;
    } catch (error) {
      console.error('Error getting bookings:', error);
      throw error;
    }
  },
  
  /**
   * Get booking by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getById(id) {
    try {
      const query = `
        SELECT b.*,
               u.name as user_name,
               u.email as user_email,
               u.phone as user_phone,
               l.title as listing_title,
               l.price_per_hour,
               l.price_per_day,
               l.unit_type as listing_unit_type,
               l.user_id as provider_id,
               p.id as payment_id,
               p.method as payment_method,
               COALESCE(p.status, b.payment_status) as payment_status_actual,
               p.transaction_id,
               p.paid_at,
               p.payment_location_id,
               pl.name as payment_location_name,
               pl.address as payment_location_address
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        JOIN listings l ON b.listing_id = l.id
        LEFT JOIN payments p ON b.id = p.booking_id AND p.id = (
          SELECT MAX(id) FROM payments WHERE booking_id = b.id
        )
        LEFT JOIN payment_locations pl ON p.payment_location_id = pl.id
        WHERE b.id = ?
      `;
      
      const bookings = await db.query(query, [id]);
      
      if (bookings.length === 0) {
        return notFound('Booking not found');
      }
      
      const booking = bookings[0];
      
      // Format datetime fields to YYYY-MM-DD HH:MM:SS
      if (booking.start_datetime) {
        booking.start_datetime = this.formatDateTimeForDisplay(booking.start_datetime);
      }
      if (booking.end_datetime) {
        booking.end_datetime = this.formatDateTimeForDisplay(booking.end_datetime);
      }
      if (booking.deposit_deadline) {
        booking.deposit_deadline = this.formatDateTimeForDisplay(booking.deposit_deadline);
      }
      if (booking.auto_cancel_at) {
        booking.auto_cancel_at = this.formatDateTimeForDisplay(booking.auto_cancel_at);
      }
      if (booking.created_at) {
        booking.created_at = this.formatDateTimeForDisplay(booking.created_at);
      }
      if (booking.updated_at) {
        booking.updated_at = this.formatDateTimeForDisplay(booking.updated_at);
      }
      if (booking.served_at) {
        booking.served_at = this.formatDateTimeForDisplay(booking.served_at);
      }
      if (booking.paid_at) {
        booking.paid_at = this.formatDateTimeForDisplay(booking.paid_at);
      }
      
      return booking;
    } catch (error) {
      console.error('Error getting booking by ID:', error);
      throw error;
    }
  },

  /**
   * Create a new booking
   * @param {Object} bookingData - Booking data
   * @returns {Promise<Object>} - Created booking
   */
  async create(bookingData) {
    // Extract booking data first to access booking_type and pricing_option_id
    const { pricing_option_id } = bookingData;
    let booking_type = bookingData.booking_type;
    
    // For appointment bookings, we need a transaction to ensure atomic ticket assignment
    const connection = booking_type === 'appointment' ? await db.getPool().getConnection() : null;
    
    try {
      // Extract booking data
      const {
        listing_id,
        user_id,
        host_id,
        start_datetime,
        end_datetime,
        guests_count,
        notes,
        selected_date,
        booking_period
      } = bookingData;
      
      // Start transaction for appointment bookings
      if (booking_type === 'appointment' && connection) {
        await connection.beginTransaction();
      }
      
      let finalStartDatetime = start_datetime;
      let finalEndDatetime = end_datetime;
      
      // For day/night bookings, automatically determine times if not provided
      // Only use determineBookingTimes if start_datetime and end_datetime are NOT provided
      if ((booking_type === 'daily' || booking_type === 'night') && booking_period && (!start_datetime || !end_datetime)) {
        const bookingTimes = await this.determineBookingTimes(listing_id, selected_date, booking_period);
        
        // Check if bookingTimes is not null before accessing its properties
        if (bookingTimes && bookingTimes.start_datetime && bookingTimes.end_datetime) {
          finalStartDatetime = bookingTimes.start_datetime;
          finalEndDatetime = bookingTimes.end_datetime;
        } else {
          console.log(`Using provided start/end times as determineBookingTimes returned null or incomplete data`);
          // Keep the original values if bookingTimes is null or incomplete
        }
      }
      
      // Log the exact times being used
      console.log(`Using booking times: ${finalStartDatetime} to ${finalEndDatetime}`);
      
      // Check if the time slot is already booked or not available
      // If booking_type is 'night' but booking_period is also provided, allow for more flexible availability check
      const isNightBooking = booking_type === 'night' || booking_period === 'night';
      
      // For night bookings, we'll be more flexible with availability checks
      let availabilityCheck;
      
      if (isNightBooking) {
        console.log('Checking availability for night booking with flexible mode');
        // First try with 'night' booking type
        availabilityCheck = await this.checkAvailability(listing_id, finalStartDatetime, finalEndDatetime, 'night', booking_period);
        
        // If not available as night, try with 'daily' booking type
        if (!availabilityCheck.available) {
          console.log('Night availability not found, trying with daily booking type');
          availabilityCheck = await this.checkAvailability(listing_id, finalStartDatetime, finalEndDatetime, 'daily', booking_period);
        }
      } else {
        // Standard availability check for non-night bookings
        availabilityCheck = await this.checkAvailability(listing_id, finalStartDatetime, finalEndDatetime, booking_type, booking_period);
      }
      
      if (!availabilityCheck.available) {
        throw badRequest(`Booking not available: ${availabilityCheck.reason}`);
      }
      
      // If we're booking a night slot but found a daily slot, adjust the booking_type
      if (isNightBooking && availabilityCheck.effectiveBookingType === 'daily') {
        console.log('Adjusting booking_type from night to daily based on available slot');
        booking_type = 'daily';
      }
      
      // Get listing details
      const listingQuery = `
        SELECT l.*, 
               JSON_ARRAYAGG(
                 JSON_OBJECT(
                   'id', po.id,
                   'price', po.price,
                   'unit_type', po.unit_type,
                   'duration', po.duration,
                   'minimum_units', po.minimum_units,
                   'maximum_units', po.maximum_units,
                   'is_default', po.is_default,
                   'description', po.description
                 )
               ) as pricing_options
        FROM listings l
        LEFT JOIN pricing_options po ON l.id = po.listing_id
        WHERE l.id = ?
        GROUP BY l.id
      `;
      
      // Use transaction connection for appointment bookings, otherwise use regular db query
      const listings = booking_type === 'appointment' && connection ?
        await connection.query(listingQuery, [listing_id]) :
        await db.query(listingQuery, [listing_id]);
      
      if (listings.length === 0) {
        throw notFound('Listing not found');
      }
      
      const listing = listings[0];
      
      // Parse pricing_options JSON string if needed
      if (typeof listing.pricing_options === 'string') {
        try {
          listing.pricing_options = JSON.parse(listing.pricing_options);
        } catch (e) {
          listing.pricing_options = [];
        }
      }
      
      // Format dates for MySQL - preserve the exact times provided
      const formattedStartDatetime = this.formatDateForMySQL(finalStartDatetime);
      const formattedEndDatetime = this.formatDateForMySQL(finalEndDatetime);
      
      // Log the formatted times to verify they're correct
      console.log(`Formatted booking times: ${formattedStartDatetime} to ${formattedEndDatetime}`);
      
      // For appointment bookings, atomically assign a ticket number within the transaction
      let ticketNumber = null;
      if (booking_type === 'appointment' && host_id && connection) {
        // Get the next ticket number for this specific slot with row lock
        const ticketQuery = `
          SELECT COALESCE(MAX(ticket_number), 0) + 1 as next_ticket
          FROM bookings 
          WHERE listing_id = ? 
          AND host_id = ? 
          AND start_datetime = ?
          AND booking_type = 'appointment'
          FOR UPDATE
        `;
        
        const [ticketResult] = await connection.query(ticketQuery, [listing_id, host_id, formattedStartDatetime]);
        ticketNumber = ticketResult[0].next_ticket;
        
        console.log(`Generated ticket number: ${ticketNumber} for appointment booking`);
      }
      
      // Calculate booking duration and total price
      const startDate = new Date(formattedStartDatetime);
      const endDate = new Date(formattedEndDatetime);
      let totalPrice = 0;
      let selectedPricingOption = null;
      let unitsBooked = 1;
      
      // Use smart pricing if pricing_options are available
      if (listing.pricing_options && Array.isArray(listing.pricing_options) && listing.pricing_options.length > 0) {
        try {
          // If pricing_option_id is provided, use that specific pricing option
          if (pricing_option_id) {
            // Find the specified pricing option
            selectedPricingOption = listing.pricing_options.find(option => option.id === parseInt(pricing_option_id, 10));
            
            if (!selectedPricingOption) {
              console.warn(`Pricing option ID ${pricing_option_id} not found for listing ${listing_id}, falling back to default`);
            }
          }
          
          // If no pricing option was found by ID or none was specified, determine by booking type
          if (!selectedPricingOption) {
            // Determine preferred unit type based on booking_type
            let preferredUnitType = null;
            switch (booking_type) {
              case 'hourly':
              case 'appointment':
                preferredUnitType = 'hour';
                break;
              case 'daily':
                preferredUnitType = 'day';
                break;
              case 'night':
                preferredUnitType = 'night';
                break;
              case 'subscription':
                preferredUnitType = 'month'; // or 'week' depending on subscription type
                break;
            }
            
            // Use smart pricing to determine the best option
            const smartPricing = smartPricingUtils.calculateSmartPrice(
              listing, 
              startDate, 
              endDate, 
              preferredUnitType
            );
            
            // Check for special pricing and apply it if available
            totalPrice = await this.calculatePriceWithSpecialPricing(
              listing_id,
              startDate,
              endDate,
              smartPricing
            );
            
            selectedPricingOption = smartPricing.pricingOption;
            unitsBooked = smartPricing.totalUnits;
          } else {
            // We have a selected pricing option, use it directly
            // Calculate price based on the selected pricing option
            const durationInMs = endDate - startDate;
            unitsBooked = this.calculateUnitsForDuration(startDate, endDate, selectedPricingOption.unit_type, selectedPricingOption.duration || 1);
            
            // Calculate base price
            const basePrice = parseFloat(selectedPricingOption.price) * unitsBooked;
            
            // Check for special pricing
            totalPrice = await this.calculatePriceWithSpecialPricing(
              listing_id,
              startDate,
              endDate,
              {
                pricingOption: selectedPricingOption,
                basePrice: basePrice,
                unitType: selectedPricingOption.unit_type,
                duration: selectedPricingOption.duration || 1,
                totalUnits: unitsBooked
              }
            );
          }
          
          // Log the selected pricing option for debugging
          console.log(`Selected pricing option: ${JSON.stringify(selectedPricingOption)}, units: ${unitsBooked}, total price: ${totalPrice}`);
          
        } catch (smartPricingError) {
          console.error('Error with smart pricing, falling back to legacy pricing:', smartPricingError);
          
          // If pricing_option_id was specified but caused an error, log it
          if (pricing_option_id) {
            console.error(`Failed to use specified pricing_option_id: ${pricing_option_id}`);
          }
          
          // Fall back to legacy pricing with special pricing check
          const durationInMs = endDate - startDate;
          const durationInHours = durationInMs / (1000 * 60 * 60);
          const durationInDays = durationInMs / (1000 * 60 * 60 * 24);
          
          let basePrice = 0;
          if (booking_type === 'hourly' || booking_type === 'appointment') {
            basePrice = listing.price_per_hour * Math.ceil(durationInHours);
          } else if (booking_type === 'daily') {
            basePrice = listing.price_per_day * Math.ceil(durationInDays);
          } else if (booking_type === 'subscription') {
            basePrice = listing.price_per_day;
          }
          
          // Check for special pricing on legacy pricing
          totalPrice = await this.calculateLegacyPriceWithSpecialPricing(
            listing_id,
            startDate,
            endDate,
            basePrice,
            booking_type
          );
        }
      } else {
        // Fall back to legacy pricing when no pricing_options available
        const durationInMs = endDate - startDate;
        const durationInHours = durationInMs / (1000 * 60 * 60);
        const durationInDays = durationInMs / (1000 * 60 * 60 * 24);
        
        let basePrice = 0;
        if (booking_type === 'hourly' || booking_type === 'appointment') {
          basePrice = listing.price_per_hour * Math.ceil(durationInHours);
          unitsBooked = Math.ceil(durationInHours);
        } else if (booking_type === 'daily') {
          basePrice = listing.price_per_day * Math.ceil(durationInDays);
          unitsBooked = Math.ceil(durationInDays);
        } else if (booking_type === 'subscription') {
          basePrice = listing.price_per_day;
          unitsBooked = 1;
        }
        
        // Check for special pricing on legacy pricing
        totalPrice = await this.calculateLegacyPriceWithSpecialPricing(
          listing_id,
          startDate,
          endDate,
          basePrice,
          booking_type
        );
      }
      
      // Ensure totalPrice is a valid number
      if (isNaN(totalPrice) || totalPrice === null) {
        console.warn('Invalid total price detected, setting default price for appointment booking');
        // For appointment bookings, use a default price if calculation failed
        if (booking_type === 'appointment') {
          // Use the hourly rate or a default value
          const hourlyRate = listing.price_per_hour || 0;
          const durationInMs = endDate - startDate;
          const durationInHours = durationInMs / (1000 * 60 * 60);
          totalPrice = hourlyRate * Math.ceil(durationInHours);
        } else {
          totalPrice = 0; // Fallback to zero if all else fails
        }
      }
      
      // Ensure totalPrice is a number
      totalPrice = Number(totalPrice) || 0;
      
      // Calculate platform commission (default 10%)
      const platformCommissionPercent = 10;
      const platformCommission = (totalPrice * platformCommissionPercent) / 100;
      
      // Calculate provider earnings
      const providerEarnings = totalPrice - platformCommission;
      
      // Calculate user service fee (default 5%)
      const userServiceFeePercent = 5;
      const userServiceFee = (totalPrice * userServiceFeePercent) / 100;
      
      // Determine booking status - use provided status or fall back to instant booking setting
      const status = bookingData.status || (listing.instant_booking_enabled ? 'confirmed' : 'pending');
      
      // Determine payment status - use provided payment_status or default to 'unpaid'
      const payment_status = bookingData.payment_status || 'unpaid';
      
      // Calculate deposit amount (default 20% of total)
      const depositPercent = 20;
      const depositAmount = (totalPrice * depositPercent) / 100;
      const remainingAmount = totalPrice - depositAmount;
      
      // Set deposit deadline (12 hours from now)
      const depositDeadline = new Date();
      depositDeadline.setHours(depositDeadline.getHours() + 12);
      
      // Set auto-cancel time (24 hours from now)
      const autoCancelAt = new Date();
      autoCancelAt.setHours(autoCancelAt.getHours() + 24);
      
      // Insert booking with pricing option information
      const insertQuery = `INSERT INTO bookings (
        listing_id, user_id, host_id, start_datetime, end_datetime, booking_type,
        guests_count, total_price, deposit_amount, remaining_amount,
        platform_commission, provider_earnings, user_service_fee,
        status, payment_status, deposit_deadline, auto_cancel_at, notes,
        pricing_option_id, units_booked, ticket_number, ticket_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      
      const insertParams = [
        listing_id,
        user_id,
        host_id,
        formattedStartDatetime,
        formattedEndDatetime,
        booking_type || 'hourly',
        guests_count || 1,
        totalPrice,
        depositAmount,
        remainingAmount,
        platformCommission,
        providerEarnings,
        userServiceFee,
        status,
        payment_status,
        this.formatDateForMySQL(depositDeadline),
        this.formatDateForMySQL(autoCancelAt),
        notes || null,
        selectedPricingOption ? selectedPricingOption.id : null,
        unitsBooked,
        ticketNumber ? parseInt(ticketNumber, 10) : null,
        booking_type === 'appointment' ? 'waiting' : null
      ];
      
      // Use transaction connection for appointment bookings, otherwise use regular db query
      let bookingId;
      
      if (booking_type === 'appointment' && connection) {
        // When using connection.query, the result format is [result, fields]
        const [result] = await connection.query(insertQuery, insertParams);
        bookingId = result.insertId;
      } else {
        // When using db.query, the result format is just result
        const result = await db.query(insertQuery, insertParams);
        bookingId = result.insertId;
      }
      
      // Ensure we have a valid booking ID
      if (!bookingId) {
        throw new Error('Failed to create booking - no booking ID returned');
      }
      
      console.log(`Successfully created booking with ID: ${bookingId}`);
      
      // For appointment bookings, create appointment queue entry within the transaction
      if (booking_type === 'appointment' && host_id && ticketNumber && connection) {
        const queueQuery = `INSERT INTO appointment_queue (
          booking_id, listing_id, host_id, slot_datetime, ticket_number, queue_status
        ) VALUES (?, ?, ?, ?, ?, 'waiting')`;
        
        await connection.query(queueQuery, [bookingId, listing_id, host_id, formattedStartDatetime, ticketNumber]);
      } else if (booking_type === 'appointment' && host_id && ticketNumber) {
        // Non-transaction fallback
        await this.createAppointmentQueueEntry(bookingId, listing_id, host_id, formattedStartDatetime, ticketNumber);
      }
      
      // Commit transaction for appointment bookings
      if (booking_type === 'appointment' && connection) {
        await connection.commit();
      }
      
      // Synchronize available slots after creating a booking
      try {
        // Import the cleanupAvailableSlots function from hostController
        // We need to require it here to avoid circular dependencies
        const { cleanupAvailableSlots } = require('../controllers/hostController');
        await cleanupAvailableSlots(listing_id);
      } catch (syncError) {
        console.error('Error synchronizing available slots after booking creation:', syncError);
        // Don't fail the booking creation if synchronization fails
      }
      
      // Create payment record if payment_method is provided
      if (bookingData.payment_method) {
        try {
          // Calculate confirmation fee (10% of total price)
          const confirmationFeePercent = 10;
          const confirmationFee = (totalPrice * confirmationFeePercent) / 100;
          
          // Set payment deadline for cash deposits (12 hours from now)
          let payment_deadline = null;
          if (bookingData.payment_method === 'cash') {
            const deadline = new Date();
            deadline.setHours(deadline.getHours() + 12);
            payment_deadline = deadline;
          }
          
          // Create payment record
          const paymentData = {
            booking_id: bookingId,
            method: bookingData.payment_method,
            amount: confirmationFee,
            deposit_amount: confirmationFee,
            remaining_amount: totalPrice - confirmationFee,
            payment_deadline,
            status: bookingData.payment_method === 'cash' ? 'pending' : 'deposit_paid'
          };
          
          await db.query(
            'INSERT INTO payments (booking_id, method, amount, deposit_amount, remaining_amount, payment_deadline, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [paymentData.booking_id, paymentData.method, paymentData.amount, paymentData.deposit_amount, paymentData.remaining_amount, paymentData.payment_deadline, paymentData.status]
          );
          
          console.log(`Payment record created for booking ${bookingId} with method: ${bookingData.payment_method}`);
        } catch (paymentError) {
          console.error('Error creating payment record:', paymentError);
          // Don't fail the booking creation if payment record creation fails
        }
      }
      
      // Return the created booking
      return this.getById(bookingId);
    } catch (error) {
      // Rollback transaction for appointment bookings if there's an error
      if (booking_type === 'appointment' && connection) {
        await connection.rollback();
      }
      
      // Release connection if it was acquired
      if (connection) {
        connection.release();
      }
      
      console.error('Error creating booking:', error);
      throw error;
    } finally {
      // Always release connection if it was acquired
      if (connection) {
        connection.release();
      }
    }
  },

  /**
   * Calculate units for a given duration based on unit type
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {string} unitType - Unit type (hour, day, night, etc.)
   * @param {number} unitDuration - Duration of each unit (e.g., 3 for 3-hour blocks)
   * @returns {number} - Number of units
   */
  calculateUnitsForDuration(startDate, endDate, unitType, unitDuration = 1) {
    const durationInMs = endDate - startDate;
    
    switch (unitType) {
      case 'hour':
        const durationInHours = durationInMs / (1000 * 60 * 60);
        return Math.ceil(durationInHours / unitDuration);
      case 'day':
        const durationInDays = durationInMs / (1000 * 60 * 60 * 24);
        return Math.ceil(durationInDays / unitDuration);
      case 'night':
        const durationInNights = durationInMs / (1000 * 60 * 60 * 24);
        return Math.ceil(durationInNights / unitDuration);
      case 'week':
        const durationInWeeks = durationInMs / (1000 * 60 * 60 * 24 * 7);
        return Math.ceil(durationInWeeks / unitDuration);
      case 'month':
        // Approximate a month as 30 days
        const durationInMonths = durationInMs / (1000 * 60 * 60 * 24 * 30);
        return Math.ceil(durationInMonths / unitDuration);
      default:
        return 1;
    }
  },
  
  /**
   * Check if a time slot is available for booking
   * @param {number} listing_id - Listing ID
   * @param {string} start_datetime - Start datetime
   * @param {string} end_datetime - End datetime
   * @returns {Promise<Object>} - Availability status and reason
   */
  async checkAvailability(listing_id, start_datetime, end_datetime, booking_type = null, booking_period = null) {
    try {
      // Format dates for MySQL if they're not already formatted
      const formattedStartDatetime = typeof start_datetime === 'string' ? start_datetime : this.formatDateForMySQL(new Date(start_datetime));
      const formattedEndDatetime = typeof end_datetime === 'string' ? end_datetime : this.formatDateForMySQL(new Date(end_datetime));
      
      // Get listing details including unit_type
      const listingQuery = `
        SELECT l.active, l.unit_type, ls.availability_mode
        FROM listings l
        LEFT JOIN listing_settings ls ON l.id = ls.listing_id
        WHERE l.id = ?
      `;
      
      const listings = await db.query(listingQuery, [listing_id]);
      
      if (listings.length === 0) {
        return { available: false, reason: 'Listing not found' };
      }
      
      if (!listings[0].active) {
        return { available: false, reason: 'Listing is not active' };
      }
      
      // Determine the effective booking type
      let effectiveBookingType = booking_type || listings[0].unit_type || 'hour';
      
      // Handle special case for night bookings with booking_period
      if (booking_period === 'night' && !booking_type) {
        effectiveBookingType = 'night';
      }
      
      // Log the availability check parameters for debugging
      console.log(`Checking availability for listing ${listing_id} from ${formattedStartDatetime} to ${formattedEndDatetime}`);
      console.log(`Booking type: ${effectiveBookingType}`);
      
      // Special handling for night bookings
      let conflictQuery;
      let conflictParams;
      
      if (effectiveBookingType === 'night') {
        // For night bookings, we need a more flexible conflict check
        // A night booking typically spans from evening to morning the next day
        console.log('Using night booking conflict detection logic');
        
        // Extract the date parts for date-based comparison
        const startDate = formattedStartDatetime.split(' ')[0]; // YYYY-MM-DD
        const endDate = formattedEndDatetime.split(' ')[0];     // YYYY-MM-DD
        
        // For night bookings, check if any booking overlaps with the date
        conflictQuery = `
          SELECT id, start_datetime, end_datetime, status, booking_type
          FROM bookings
          WHERE listing_id = ?
            AND status IN ('confirmed', 'pending')
            AND (
              (DATE(start_datetime) = ? OR DATE(end_datetime) = ?) OR
              (DATE(start_datetime) <= ? AND DATE(end_datetime) >= ?)
            )
        `;
        
        conflictParams = [
          listing_id,
          startDate, startDate,  // Check if any booking starts or ends on our start date
          startDate, startDate   // Check if any booking spans our start date
        ];
      } else {
        // Standard conflict check for other booking types
        conflictQuery = `
          SELECT id, start_datetime, end_datetime, status, booking_type
          FROM bookings
          WHERE listing_id = ?
            AND status IN ('confirmed', 'pending')
            AND (
              (start_datetime < ? AND end_datetime > ?) OR
              (start_datetime >= ? AND start_datetime < ?) OR
              (end_datetime > ? AND end_datetime <= ?)
            )
        `;
        
        conflictParams = [
          listing_id,
          formattedEndDatetime, formattedStartDatetime,
          formattedStartDatetime, formattedEndDatetime,
          formattedStartDatetime, formattedEndDatetime
        ];
      }
      
      // Check for conflicting bookings
      const bookingConflicts = await db.query(conflictQuery, conflictParams);
      
      if (bookingConflicts.length > 0) {
        console.log('Found booking conflicts:', bookingConflicts.map(b => 
          `ID: ${b.id}, Type: ${b.booking_type}, Time: ${b.start_datetime} - ${b.end_datetime}`).join(', '));
        
        return { 
          available: false, 
          reason: `Time slot conflicts with existing booking(s)`,
          conflicts: bookingConflicts
        };
      }
      
      // Check for blocked dates with appropriate logic based on booking type
      let blockedQuery;
      let blockedParams;
      
      if (effectiveBookingType === 'night') {
        // For night bookings, check if the date is blocked
        const startDate = formattedStartDatetime.split(' ')[0]; // YYYY-MM-DD
        
        blockedQuery = `
          SELECT id, reason
          FROM blocked_dates
          WHERE listing_id = ?
            AND DATE(start_datetime) <= ? 
            AND DATE(end_datetime) >= ?
        `;
        
        blockedParams = [listing_id, startDate, startDate];
      } else {
        // Standard blocked date check for other booking types
        blockedQuery = `
          SELECT id, reason
          FROM blocked_dates
          WHERE listing_id = ?
            AND (
              (start_datetime < ? AND end_datetime > ?) OR
              (start_datetime >= ? AND start_datetime < ?) OR
              (end_datetime > ? AND end_datetime <= ?)
            )
        `;
        
        blockedParams = [
          listing_id,
          formattedEndDatetime, formattedStartDatetime,
          formattedStartDatetime, formattedEndDatetime,
          formattedStartDatetime, formattedEndDatetime
        ];
      }
      
      const blockedDates = await db.query(blockedQuery, blockedParams);
      
      if (blockedDates.length > 0) {
        console.log('Found blocked dates:', blockedDates);
        
        return { 
          available: false, 
          reason: `Time slot is blocked: ${blockedDates[0].reason || 'No reason provided'}`,
          blockedDates: blockedDates
        };
      }
      
      // Check if there's explicit availability for this time slot
      // This depends on the listing's availability mode
      const availabilityMode = listings[0].availability_mode || 'available-by-default';
      console.log(`Availability mode: ${availabilityMode}`);
      
      // For available-by-default mode, we assume the slot is available unless blocked
      if (availabilityMode === 'available-by-default') {
        console.log('Using available-by-default mode - slot is available');
        // We've already checked for conflicts and blocks above, so we're good
        return { 
          available: true,
          effectiveBookingType: booking_type || effectiveBookingType || 'daily' 
        };
      }
      
      // For blocked-by-default mode, we need to find explicit availability
      if (availabilityMode === 'blocked-by-default') {
        console.log('Using blocked-by-default mode - checking for explicit availability');
        
        // Different availability checks based on booking type
        if (effectiveBookingType === 'night') {
          // For night bookings in blocked-by-default mode, check if the date has night availability
          const startDate = formattedStartDatetime.split(' ')[0]; // YYYY-MM-DD
          
          // Check available_slots table first (newer approach)
          try {
            // More flexible query for night slots - using only existing columns in the available_slots table
            // Night slots can have different start times and booking_type based on configuration
            const nightSlotsQuery = `
              SELECT id, start_datetime, end_datetime, booking_type, slot_type
              FROM available_slots
              WHERE listing_id = ?
                AND is_available = 1
                AND (
                  (booking_type = 'night' AND DATE(start_datetime) = ?) OR
                  (DATE(start_datetime) = ? AND DATE(end_datetime) > DATE(start_datetime)) OR
                  (HOUR(start_datetime) >= 16 AND DATE(start_datetime) = ?)
                )
            `;
            
            const nightSlots = await db.query(nightSlotsQuery, [listing_id, startDate, startDate, startDate]);
            console.log(`Found ${nightSlots.length} night slots in available_slots table:`, 
              nightSlots.map(s => `${s.id}: ${s.start_datetime} - ${s.end_datetime} (${s.booking_type || 'unknown'})`).join(', '));
            
            if (nightSlots.length > 0) {
              // Return the booking type of the first matching slot
              const effectiveBookingType = nightSlots[0].booking_type || 'night';
              return { 
                available: true,
                effectiveBookingType: effectiveBookingType
              };
            }
            
            // If no night slots found, check the availability table (legacy)
            // This is more permissive - any availability entry for the date is considered valid
            const legacyNightQuery = `
              SELECT id, date, start_time, end_time
              FROM availability
              WHERE listing_id = ?
                AND is_available = 1
                AND date = ?
            `;
            
            const legacyNightSlots = await db.query(legacyNightQuery, [listing_id, startDate]);
            console.log(`Found ${legacyNightSlots.length} night slots in legacy availability table:`, 
              legacyNightSlots.map(s => `${s.id}: ${s.date} ${s.start_time} - ${s.end_time}`).join(', '));
            
            if (legacyNightSlots.length > 0) {
              return { 
                available: true,
                effectiveBookingType: 'night' // Legacy slots default to night
              };
            }
            
            // As a last resort, check if the listing is in available-by-default mode at the database level
            // Some listings might be misconfigured with wrong availability_mode in the settings
            const listingModeQuery = `
              SELECT l.id, COALESCE(ls.availability_mode, 'available-by-default') as actual_mode
              FROM listings l
              LEFT JOIN listing_settings ls ON l.id = ls.listing_id
              WHERE l.id = ?
            `;
            
            const listingModeResult = await db.query(listingModeQuery, [listing_id]);
            if (listingModeResult.length > 0) {
              const actualMode = listingModeResult[0].actual_mode;
              console.log(`Listing ${listing_id} actual availability mode: ${actualMode}`);
              
              if (actualMode === 'available-by-default') {
                console.log('Listing is actually in available-by-default mode, allowing booking');
                return { 
                  available: true,
                  effectiveBookingType: booking_type || 'daily'
                };
              }
            }
            
            // No night availability found
            return { 
              available: false, 
              reason: 'No night availability found for the requested date'
            };
            
          } catch (error) {
            console.error('Error checking night availability:', error);
            return { 
              available: false, 
              reason: 'Error checking night availability'
            };
          }
        } else {
          // Standard availability check for other booking types
          // First check the availability table (legacy)
          const availabilityQuery = `
            SELECT id
            FROM availability
            WHERE listing_id = ?
              AND is_available = 1
              AND (
                (date = DATE(?) AND start_time <= TIME(?) AND end_time >= TIME(?))
              )
          `;
          
          const availabilitySlots = await db.query(availabilityQuery, [
            listing_id,
            formattedStartDatetime, formattedStartDatetime, formattedEndDatetime
          ]);
          
          console.log(`Found ${availabilitySlots.length} matching slots in availability table`);
          
          // If found in availability table, we're good
          if (availabilitySlots.length > 0) {
            return { available: true };
          }
          
          // If no availability found in the availability table, check the available_slots table
          try {
            // More flexible query that allows partial overlaps
            const availableSlotsQuery = `
              SELECT id, start_datetime, end_datetime
              FROM available_slots
              WHERE listing_id = ?
                AND is_available = 1
                AND (
                  (start_datetime <= ? AND end_datetime >= ?) OR
                  (start_datetime <= ? AND end_datetime >= ?)
                )
            `;
            
            const availableSlots = await db.query(availableSlotsQuery, [
              listing_id,
              formattedStartDatetime, formattedStartDatetime,  // Slot starts before or at booking start and covers start
              formattedEndDatetime, formattedEndDatetime       // Slot ends after or at booking end and covers end
            ]);
            
            console.log(`Found ${availableSlots.length} matching slots in available_slots table:`, 
              availableSlots.map(s => `${s.start_datetime} - ${s.end_datetime}`).join(', '));
            
            if (availableSlots.length === 0) {
              return { 
                available: false, 
                reason: 'No availability found for the requested time slot'
              };
            }
            
            // We found at least one available slot that covers our booking
            return { available: true };
            
          } catch (slotError) {
            // If the available_slots table doesn't exist or there's another error
            console.error('Error checking available_slots:', slotError);
            return { 
              available: false, 
              reason: 'Error checking availability slots'
            };
          }
        }
      }
      
      // If we've made it this far, the time slot is available
      return { available: true };
    } catch (error) {
      console.error('Error checking availability:', error);
      return { available: false, reason: 'Error checking availability' };
    }
  },

  /**
   * Calculate price with special pricing for legacy pricing
   * @param {number} listingId - Listing ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {number} basePrice - Base price from legacy calculation
   * @param {string} bookingType - Booking type
   * @returns {Promise<number>} - Total price with special pricing applied
   */
  async calculateLegacyPriceWithSpecialPricing(listingId, startDate, endDate, basePrice, bookingType) {
    try {
      // For legacy pricing, we need to find the default pricing option
      const defaultPricingOption = await db.query(
        'SELECT * FROM pricing_options WHERE listing_id = ? AND is_default = 1 LIMIT 1',
        [listingId]
      );
      
      if (defaultPricingOption.length === 0) {
        // No pricing options available, return base price
        return basePrice;
      }
      
      const pricingOptionId = defaultPricingOption[0].id;
      let totalPrice = 0;
      let hasSpecialPricing = false;
      
      // Calculate price for each date in the range
      const currentDate = new Date(startDate);
      const endDateOnly = new Date(endDate);
      const durationInMs = endDate - startDate;
      
      if (bookingType === 'hourly' || bookingType === 'session' || bookingType === 'appointment') {
        // For hourly bookings, check special pricing for the start date
        const dateString = startDate.toISOString().split('T')[0];
        const effectivePrice = await specialPricingModel.getEffectivePrice(
          listingId,
          dateString,
          pricingOptionId
        );
        
        if (effectivePrice.source === 'special') {
          hasSpecialPricing = true;
          const durationInHours = durationInMs / (1000 * 60 * 60);
          totalPrice = effectivePrice.price * Math.ceil(durationInHours);
        } else {
          totalPrice = basePrice;
        }
      } else {
        // For daily/night bookings, check each date
        while (currentDate < endDateOnly) {
          const dateString = currentDate.toISOString().split('T')[0];
          
          const effectivePrice = await specialPricingModel.getEffectivePrice(
            listingId,
            dateString,
            pricingOptionId
          );
          
          if (effectivePrice.source === 'special') {
            hasSpecialPricing = true;
            totalPrice += effectivePrice.price;
          } else {
            // Use regular price divided by number of days
            const durationInDays = durationInMs / (1000 * 60 * 60 * 24);
            totalPrice += basePrice / Math.ceil(durationInDays);
          }
          
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }
      
      return totalPrice > 0 ? totalPrice : basePrice;
    } catch (error) {
      console.error('Error calculating legacy price with special pricing:', error);
      return basePrice;
    }
  },
  
  /**
   * Calculate price with special pricing for smart pricing
   * @param {number} listingId - Listing ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {Object} smartPricing - Smart pricing calculation result
   * @returns {Promise<number>} - Total price with special pricing applied
   */
  async calculatePriceWithSpecialPricing(listingId, startDate, endDate, smartPricing) {
    try {
      if (!smartPricing.pricingOption) {
        return smartPricing.basePrice;
      }

      const pricingOptionId = smartPricing.pricingOption.id;
      let totalPrice = 0;
      let hasSpecialPricing = false;

      // Calculate price for each date in the range
      const currentDate = new Date(startDate);
      const endDateOnly = new Date(endDate);
      
      while (currentDate < endDateOnly) {
        const dateString = currentDate.toISOString().split('T')[0];
        
        // Check for special pricing for this date
        const effectivePrice = await specialPricingModel.getEffectivePrice(
          listingId,
          dateString,
          pricingOptionId
        );
        
        if (effectivePrice.source === 'special') {
          hasSpecialPricing = true;
          // Calculate units for this date based on unit type
          const unitsForDate = 1; // Simplified for now
          totalPrice += effectivePrice.price * unitsForDate;
        } else {
          // Use regular pricing for this date
          const unitsForDate = 1; // Simplified for now
          totalPrice += effectivePrice.price * unitsForDate;
        }
        
        // Move to next date based on unit type
        if (smartPricing.unitType === 'hour') {
          currentDate.setHours(currentDate.getHours() + (smartPricing.duration || 1));
        } else {
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }
      
      return totalPrice > 0 ? totalPrice : smartPricing.basePrice;
    } catch (error) {
      console.error('Error calculating price with special pricing:', error);
      return smartPricing.basePrice;
    }
  },

  // Helper function to format date for MySQL that preserves local time
  formatDateForMySQL(date) {
    if (!date) return null;
    
    // Check if it's already a string in MySQL format
    if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
      return date;
    }
    
    // Convert to Date object if it's a string but not in MySQL format
    if (typeof date === 'string') {
      date = new Date(date);
    }
    
    // Format the date to preserve local time (not UTC)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  },
  
  // Helper function to format datetime for display in API responses
  formatDateTimeForDisplay(datetime) {
    if (!datetime) return null;
    
    // If it's already in the desired format, return it
    if (typeof datetime === 'string' && datetime.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
      return datetime;
    }
    
    // Handle ISO format strings or Date objects
    let date;
    if (typeof datetime === 'string') {
      date = new Date(datetime);
    } else {
      date = datetime;
    }
    
    // Format as YYYY-MM-DD HH:MM:SS
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  },

  /**
   * Automatically determine booking times based on availability and unit type
   * @param {number} listing_id - Listing ID
   * @param {string} selected_date - Selected date (YYYY-MM-DD)
   * @param {string} booking_period - 'morning', 'night', or 'day' for day/night listings
   * @returns {Promise<Object>} - Start and end datetime
   */
  async determineBookingTimes(listing_id, selected_date, booking_period = null) {
    try {
      // Get listing details to determine unit type
      const listingQuery = `
        SELECT l.unit_type
        FROM listings l
        WHERE l.id = ? AND l.active = 1
      `;
      
      const listings = await db.query(listingQuery, [listing_id]);
      
      if (listings.length === 0) {
        throw notFound('Listing not found or inactive');
      }
      
      const listing = listings[0];
      
      // For hour unit type, return null to use existing time selection logic
      if (listing.unit_type === 'hour') {
        return null;
      }
      
      // For day/night unit types, get availability for the selected date
      const availabilityQuery = `
        SELECT 
          CASE 
            WHEN start_datetime IS NOT NULL THEN start_datetime
            ELSE CONCAT(date, ' ', start_time)
          END as unified_start_datetime,
          CASE 
            WHEN end_datetime IS NOT NULL THEN end_datetime
            ELSE CONCAT(COALESCE(end_date, date), ' ', end_time)
          END as unified_end_datetime,
          is_overnight
        FROM availability 
        WHERE listing_id = ? 
          AND is_available = 1
          AND (
            date = ? OR 
            (is_overnight = 1 AND date = ?)
          )
        ORDER BY unified_start_datetime ASC
      `;
      
      const availability = await db.query(availabilityQuery, [listing_id, selected_date, selected_date]);
      
      if (availability.length === 0) {
        throw badRequest('No availability found for the selected date');
      }
      
      // Determine which availability slot to use based on booking_period
      let selectedSlot = null;
      
      if (booking_period === 'morning' || booking_period === 'day') {
        // Find morning/day slot (typically starts in AM hours)
        selectedSlot = availability.find(slot => {
          const startTime = new Date(slot.unified_start_datetime);
          return startTime.getHours() >= 6 && startTime.getHours() < 18; // 6 AM to 6 PM
        });
      } else if (booking_period === 'night') {
        // Find night slot (typically starts in PM hours or overnight)
        selectedSlot = availability.find(slot => {
          const startTime = new Date(slot.unified_start_datetime);
          return startTime.getHours() >= 18 || startTime.getHours() < 6 || slot.is_overnight; // 6 PM onwards or overnight
        });
      }
      
      // If no specific period slot found, use the first available slot
      if (!selectedSlot) {
        selectedSlot = availability[0];
      }
      
      return {
        start_datetime: selectedSlot.unified_start_datetime,
        end_datetime: selectedSlot.unified_end_datetime
      };
      
    } catch (error) {
      console.error('Error determining booking times:', error);
      throw error;
    }
  },

  /**
   * Update a booking (controller method)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updateBooking(req, res, next) {
    try {
      const { id } = req.params;
      const bookingData = req.body;
      
      // Get booking to check permissions
      const booking = await this.getById(id);
      
      // Check if user has permission to update this booking
      if (
        booking.user_id !== req.user.id &&
        booking.provider_id !== req.user.id &&
        !req.user.is_admin
      ) {
        return next(badRequest('You do not have permission to update this booking'));
      }
      
      // Restrict what users can update
      if (req.user.id === booking.user_id && !req.user.is_admin) {
        // Regular users can only update notes
        const allowedFields = ['notes'];
        Object.keys(bookingData).forEach(key => {
          if (!allowedFields.includes(key)) {
            delete bookingData[key];
          }
        });
      }
      
      // Providers can update status but not payment status
      if (req.user.id === booking.provider_id && !req.user.is_admin) {
        const allowedFields = ['status', 'notes'];
        Object.keys(bookingData).forEach(key => {
          if (!allowedFields.includes(key)) {
            delete bookingData[key];
          }
        });
        
        // Providers can only set status to confirmed or cancelled
        if (bookingData.status && !['confirmed', 'cancelled'].includes(bookingData.status)) {
          return next(badRequest('Invalid status value'));
        }
      }
      
      const updatedBooking = await this.update(id, bookingData);
      
      res.status(200).json({
        status: 'success',
        data: updatedBooking
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Update a booking (model method)
   * @param {number|string} id - Booking ID
   * @param {Object} bookingData - Data to update
   * @returns {Promise<Object>} - Updated booking
   */
  async update(id, bookingData) {
    try {
      // Build SET clause dynamically from bookingData object
      const setClause = [];
      const queryParams = [];
      
      // Process each field in the bookingData object
      for (const [key, value] of Object.entries(bookingData)) {
        setClause.push(`${key} = ?`);
        queryParams.push(value);
      }
      
      // Add the ID parameter for the WHERE clause
      queryParams.push(id);
      
      // Construct the full query
      const query = `UPDATE bookings SET ${setClause.join(', ')} WHERE id = ?`;
      
      // Execute the query with parameters
      const result = await db.query(query, queryParams);
      
      if (result.affectedRows === 0) {
        throw notFound('Booking not found');
      }
      
      // Return the updated booking
      return this.getById(id);
    } catch (error) {
      console.error('Error updating booking:', error);
      throw error;
    }
  },
  
  /**
   * Cancel a booking (controller method)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async cancelBooking(req, res, next) {
    try {
      const { id } = req.params;
      
      // Get booking to check permissions
      const booking = await this.getById(id);
      
      // Check if user has permission to cancel this booking
      if (
        booking.user_id !== req.user.id &&
        booking.provider_id !== req.user.id &&
        !req.user.is_admin
      ) {
        return next(badRequest('You do not have permission to cancel this booking'));
      }
      
      // Determine who cancelled
      const cancelledBy = booking.user_id === req.user.id ? 'user' : 'provider';
      
      const cancelledBooking = await this.cancel(id, cancelledBy);
      
      res.status(200).json({
        status: 'success',
        data: cancelledBooking
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Cancel a booking (model method)
   * @param {number|string} id - Booking ID
   * @param {string} cancelledBy - Who cancelled the booking ('user' or 'provider')
   * @returns {Promise<Object>} - Cancelled booking
   */
  async cancel(id, cancelledBy) {
    try {
      // Update booking status to cancelled
      // Only use fields that exist in the database schema
      const updateData = {
        status: 'cancelled',
        notes: cancelledBy === 'user' ? 'Cancelled by user' : 'Cancelled by provider'
      };
      
      // Use the update method to update the booking
      const cancelledBooking = await this.update(id, updateData);
      
      return cancelledBooking;
    } catch (error) {
      console.error('Error cancelling booking:', error);
      throw error;
    }
  },
  
  /**
   * Complete a booking
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async complete(req, res, next) {
    try {
      const { id } = req.params;
      
      // Get booking to check permissions
      const booking = await bookingModel.getById(id);
      
      // Check if user has permission to complete this booking
      if (booking.provider_id !== req.user.id && !req.user.is_admin) {
        return next(badRequest('Only providers can complete bookings'));
      }
      
      const completedBooking = await bookingModel.complete(id);
      
      res.status(200).json({
        status: 'success',
        data: completedBooking
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get booking data that affects availability for a specific listing
   * Used by guest reservation screens to show booked time slots
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getListingBookings(req, res, next) {
    try {
      const { listingId } = req.params;
      const { start_date, end_date } = req.query;
            
      // Check if listing exists
      const listing = await listingModel.getById(listingId);
      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found'
        });
      }
      
      // Build query to get bookings that affect availability
      let query = `
        SELECT 
          b.id,
          b.listing_id,
          b.start_datetime,
          b.end_datetime,
          b.status,
          b.guests_count,
          b.total_price,
          b.created_at,
          u.name as guest_name,
          l.title as listing_title,
          l.unit_type as listing_unit_type
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        JOIN listings l ON b.listing_id = l.id
        WHERE b.listing_id = ? 
        AND b.status IN ('pending', 'confirmed', 'completed')
      `;
      
      const params = [listingId];
      
      // Add date range filter if provided
      if (start_date && end_date) {
        query += ` AND (
          (DATE(b.start_datetime) >= ? AND DATE(b.start_datetime) <= ?) OR
          (DATE(b.end_datetime) >= ? AND DATE(b.end_datetime) <= ?) OR
          (DATE(b.start_datetime) <= ? AND DATE(b.end_datetime) >= ?)
        )`;
        params.push(start_date, end_date, start_date, end_date, start_date, end_date);
      }
      
      query += ` ORDER BY b.start_datetime ASC`;
      
      
      const bookings = await db.query(query, params);
            
      // Format bookings for guest availability display
      const formattedBookings = bookings.map(booking => ({
        id: booking.id,
        listing_id: booking.listing_id,
        start_datetime: booking.start_datetime,
        end_datetime: booking.end_datetime,
        status: booking.status,
        guests_count: booking.guests_count,
        total_price: booking.total_price,
        guest_name: booking.guest_name,
        listing_title: booking.listing_title,
        unit_type: booking.listing_unit_type,
        is_booked: true,
        is_available: false,
        type: 'booking',
        reason: `Booked by ${booking.guest_name} (${booking.status})`
      }));
      
      res.status(200).json({
        status: 'success',
        data: {
          listing_id: listingId,
          bookings: formattedBookings,
          total_count: formattedBookings.length
        }
      });
      
    } catch (error) {
      console.error('Error getting listing bookings:', error);
      next(error);
    }
  },

  /**
   * Process payment for a booking
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async processPayment(req, res, next) {
    try {
      const { id } = req.params;
      const { payment_method, transaction_id } = req.body;
      
      // Get booking to check permissions
      const booking = await bookingModel.getById(id);
      
      // Check if user has permission to pay for this booking
      if (booking.user_id !== req.user.id && !req.user.is_admin) {
        return next(badRequest('You do not have permission to pay for this booking'));
      }
      
      // Check if booking is already paid
      if (booking.payment_status === 'paid') {
        return next(badRequest('Booking is already paid'));
      }
      
      // Update payment status
      const updatedBooking = await bookingModel.update(id, {
        payment_status: 'paid'
      });
      
      // Update payment record
      await db.query(
        'UPDATE payments SET method = ?, status = ?, transaction_id = ?, paid_at = ? WHERE booking_id = ?',
        [payment_method, 'paid', transaction_id, new Date(), id]
      );
      
      res.status(200).json({
        status: 'success',
        data: updatedBooking
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get available time slots for a listing on a specific date
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getAvailableTimeSlots(req, res, next) {
    try {
      const listingId = parseInt(req.params.listing_id);
      const date = req.query.date;
      
      if (!listingId) {
        return next(badRequest('Listing ID is required'));
      }
      
      if (!date) {
        return next(badRequest('Date parameter is required'));
      }
      
      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        return next(badRequest('Date must be in YYYY-MM-DD format'));
      }
      
      // Get available time slots using the bookingModel helper method
      const timeSlots = await bookingModel.getAvailableTimeSlots(listingId, date);
      
      res.status(200).json({
        status: 'success',
        data: timeSlots,
        message: `Found ${timeSlots.length} available time slots for ${date}`
      });
      
    } catch (error) {
      console.error('Error getting available time slots:', error);
      next(error);
    }
  }
};

module.exports = bookingModel;
