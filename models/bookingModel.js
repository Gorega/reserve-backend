const db = require('../config/database');
const { notFound, badRequest } = require('../utils/errorHandler');
const listingModel = require('./listingModel');
const smartPricingUtils = require('../utils/smartPricingUtils');
const specialPricingModel = require('./specialPricingModel');
const pricingOptionModel = require('./pricingOptionModel');

/**
 * Booking Model
 * Handles all database operations for the bookings table
 */
const bookingModel = {
  /**
   * Get all bookings with optional filtering
   * @param {Object} filters - Optional filters
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Array>} - List of bookings
   */
  async getAll(filters = {}, page = 1, limit = 10) {
    try {
      // Ensure values are proper numbers
      page = Number(page) || 1;
      limit = Number(limit) || 10;
      const offset = (page - 1) * limit;
      
      // Base query with joins for user and listing info
      let query = `
        SELECT b.*, 
               u.name as user_name, 
               u.email as user_email,
               l.title as listing_title,
               l.location as listing_location,
               l.unit_type as listing_unit_type,
               l.price_per_hour,
               l.price_per_day,
               COALESCE(p.status, b.payment_status) as payment_status_actual,
               (SELECT image_url FROM listing_photos WHERE listing_id = l.id AND is_cover = 1 LIMIT 1) as listing_cover_photo
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        JOIN listings l ON b.listing_id = l.id
        LEFT JOIN payments p ON b.id = p.booking_id
      `;
      
      const params = [];
      
      // Add filters if provided
      if (Object.keys(filters).length > 0) {
        const filterConditions = [];
        
        if (filters.user_id) {
          filterConditions.push('b.user_id = ?');
          params.push(Number(filters.user_id));
        }
        
        if (filters.listing_id) {
          filterConditions.push('b.listing_id = ?');
          params.push(Number(filters.listing_id));
        }
        
        if (filters.provider_id) {
          filterConditions.push('l.user_id = ?');
          params.push(Number(filters.provider_id));
        }
        
        if (filters.user_or_provider_id) {
          filterConditions.push('(b.user_id = ? OR l.user_id = ?)');
          params.push(Number(filters.user_or_provider_id));
          params.push(Number(filters.user_or_provider_id));
        }
        
        if (filters.status) {
          filterConditions.push('b.status = ?');
          params.push(String(filters.status));
        }
        
        if (filters.payment_status) {
          filterConditions.push('b.payment_status = ?');
          params.push(String(filters.payment_status));
        }
        
        if (filters.start_date) {
          filterConditions.push('DATE(b.start_datetime) >= ?');
          params.push(String(filters.start_date));
        }
        
        if (filters.end_date) {
          filterConditions.push('DATE(b.end_datetime) <= ?');
          params.push(String(filters.end_date));
        }
        
        if (filterConditions.length > 0) {
          query += ' WHERE ' + filterConditions.join(' AND ');
        }
      }
      
      // Add sorting
      query += ' ORDER BY b.created_at DESC';
      
      // For counting, don't add LIMIT
      if (limit < 10000) {
        // Add pagination directly in the SQL string instead of using parameters
        query += ` LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;
      }
      
      const bookings = await db.query(query, params);
      
      
      // Test without filters to see if data exists
      if (bookings.length === 0 && Object.keys(filters).length > 0) {
        const testQuery = `
          SELECT COUNT(*) as total
          FROM bookings b
          JOIN users u ON b.user_id = u.id
          JOIN listings l ON b.listing_id = l.id
        `;
        const testResult = await db.query(testQuery);
        
        // Test specific user/provider data
        if (filters.user_id) {
          const userTestQuery = `SELECT COUNT(*) as total FROM bookings WHERE user_id = ?`;
          const userTestResult = await db.query(userTestQuery, [filters.user_id]);
        }
        
        if (filters.provider_id) {
          const providerTestQuery = `
            SELECT COUNT(*) as total 
            FROM bookings b 
            JOIN listings l ON b.listing_id = l.id 
            WHERE l.user_id = ?
          `;
          const providerTestResult = await db.query(providerTestQuery, [filters.provider_id]);
          
          // Check what listings this user owns
          const listingsQuery = `SELECT id, title, user_id FROM listings WHERE user_id = ?`;
          const userListings = await db.query(listingsQuery, [filters.provider_id]);
          
          // Check the actual listing owner for our booking
          const listingOwnerQuery = `
            SELECT l.id, l.title, l.user_id as listing_owner, b.user_id as booking_user
            FROM bookings b 
            JOIN listings l ON b.listing_id = l.id 
            WHERE b.listing_id = 9
          `;
          const listingOwner = await db.query(listingOwnerQuery);
        }
      }
      
      return bookings;
    } catch (error) {
      console.error('Error getting bookings:', error);
      throw error;
    }
  },
  
  /**
   * Get booking by ID
   * @param {number} id - Booking ID
   * @returns {Promise<Object>} - Booking object
   */
  async getById(id) {
    try {
      // Get booking with joins for user, listing, and payment info
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
        LEFT JOIN payments p ON b.id = p.booking_id
        LEFT JOIN payment_locations pl ON p.payment_location_id = pl.id
        WHERE b.id = ?
      `;
      
      const bookings = await db.query(query, [id]);
      
      if (bookings.length === 0) {
        throw notFound('Booking not found');
      }
      
      const booking = bookings[0];
      
      // Get provider info
      const providerQuery = `SELECT id, name, email, phone, profile_image FROM users WHERE id = ?`;
      const providers = await db.query(providerQuery, [booking.provider_id]);
      
      if (providers.length > 0) {
        booking.provider = providers[0];
      }
      
      // Get listing details
      booking.listing = await listingModel.getById(booking.listing_id);
      
      return booking;
    } catch (error) {
      console.error('Error getting booking by ID:', error);
      throw error;
    }
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
   * Create a new booking
   * @param {Object} bookingData - Booking data
   * @returns {Promise<Object>} - Created booking
   */
  async create(bookingData) {
    try {
      // Extract booking data
      const {
        listing_id,
        user_id,
        start_datetime,
        end_datetime,
        booking_type,
        guests_count,
        notes,
        selected_date,
        booking_period
      } = bookingData;
      
      let finalStartDatetime = start_datetime;
      let finalEndDatetime = end_datetime;
      
      // For day/night bookings, automatically determine times if not provided
      if ((booking_type === 'daily' || booking_type === 'night') && selected_date && !start_datetime) {
        const autoTimes = await this.determineBookingTimes(listing_id, selected_date, booking_period);
        if (autoTimes) {
          finalStartDatetime = autoTimes.start_datetime;
          finalEndDatetime = autoTimes.end_datetime;
        }
      }
      
      // Format dates for MySQL
      const formattedStartDatetime = this.formatDateForMySQL(finalStartDatetime);
      const formattedEndDatetime = this.formatDateForMySQL(finalEndDatetime);
      
      // Check if the listing exists and is active
      const listingQuery = `
        SELECT l.*, c.name as category_name, 
               u.id as provider_id, u.name as provider_name,
               ls.availability_mode, ls.min_advance_booking_hours,
               ls.instant_booking_enabled
        FROM listings l
        JOIN users u ON l.user_id = u.id
        JOIN categories c ON l.category_id = c.id
        LEFT JOIN listing_settings ls ON l.id = ls.listing_id
        WHERE l.id = ? AND l.active = 1
      `;
      
      const listings = await db.query(listingQuery, [listing_id]);
      
      if (listings.length === 0) {
        throw notFound('Listing not found or inactive');
      }
      
      const listing = listings[0];
      
      // Fetch pricing options for this listing
      listing.pricing_options = await pricingOptionModel.getByListingId(listing_id);
      
      // Check if the listing is available for the requested time
      const isAvailable = await listingModel.checkAvailability(
        listing_id,
        formattedStartDatetime,
        formattedEndDatetime
      );
      
      if (!isAvailable) {
        throw badRequest('Listing is not available for the requested time period');
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
          // Determine preferred unit type based on booking_type
          let preferredUnitType = null;
          switch (booking_type) {
            case 'hourly':
            case 'session':
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

        } catch (smartPricingError) {
          console.error('Error with smart pricing, falling back to legacy pricing:', smartPricingError);
          // Fall back to legacy pricing with special pricing check
          const durationInMs = endDate - startDate;
          const durationInHours = durationInMs / (1000 * 60 * 60);
          const durationInDays = durationInMs / (1000 * 60 * 60 * 24);
          
          let basePrice = 0;
          if (booking_type === 'hourly' || booking_type === 'session' || booking_type === 'appointment') {
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
        if (booking_type === 'hourly' || booking_type === 'session' || booking_type === 'appointment') {
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
      
      // Calculate platform commission (default 10%)
      const platformCommissionPercent = 10;
      const platformCommission = (totalPrice * platformCommissionPercent) / 100;
      
      // Calculate provider earnings
      const providerEarnings = totalPrice - platformCommission;
      
      // Calculate user service fee (default 5%)
      const userServiceFeePercent = 5;
      const userServiceFee = (totalPrice * userServiceFeePercent) / 100;
      
      // Determine booking status based on instant booking setting
      const status = listing.instant_booking_enabled ? 'confirmed' : 'pending';
      
      // Calculate deposit amount (default 20% of total)
      const depositPercent = 20;
      const depositAmount = (totalPrice * depositPercent) / 100;
      const remainingAmount = totalPrice - depositAmount;
      
      // Set deposit deadline (12 hours from now)
      const depositDeadline = new Date();
      depositDeadline.setHours(depositDeadline.getHours() + 12);
      
      // Set auto-cancel time (same as deposit deadline initially)
      const autoCancelAt = new Date(depositDeadline);
      
      // Insert booking with pricing option information
      const bookingResult = await db.query(
        `INSERT INTO bookings (
          listing_id, user_id, start_datetime, end_datetime, booking_type,
          guests_count, total_price, deposit_amount, remaining_amount,
          platform_commission, provider_earnings, user_service_fee,
          status, payment_status, deposit_deadline, auto_cancel_at, notes,
          pricing_option_id, units_booked
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          listing_id,
          user_id,
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
          'unpaid',
          this.formatDateForMySQL(depositDeadline),
          this.formatDateForMySQL(autoCancelAt),
          notes || null,
          selectedPricingOption ? selectedPricingOption.id : null,
          unitsBooked
        ]
      );
      
      const bookingId = bookingResult.insertId;
      
      // Return the created booking
      return this.getById(bookingId);
    } catch (error) {
      console.error('Error creating booking:', error);
      throw error;
    }
  },
  
  /**
   * Update a booking
   * @param {number} id - Booking ID
   * @param {Object} bookingData - Booking data to update
   * @returns {Promise<Object>} - Updated booking
   */
  async update(id, bookingData) {
    try {
      // Check if booking exists
      const booking = await this.getById(id);
      
      // Prepare update data
      const updateData = {};
      
      // Only include fields that are provided and allowed to be updated
      if (bookingData.status) updateData.status = bookingData.status;
      if (bookingData.payment_status) updateData.payment_status = bookingData.payment_status;
      if (bookingData.notes) updateData.notes = bookingData.notes;
      if (bookingData.deposit_amount) updateData.deposit_amount = bookingData.deposit_amount;
      if (bookingData.remaining_amount) updateData.remaining_amount = bookingData.remaining_amount;
      if (bookingData.deposit_deadline) updateData.deposit_deadline = bookingData.deposit_deadline;
      if (bookingData.auto_cancel_at) updateData.auto_cancel_at = bookingData.auto_cancel_at;
      
      // Update booking
      await db.update('bookings', id, updateData);
      
      // Update payment if payment status changed
      if (bookingData.payment_status) {
        await db.query(
          'UPDATE payments SET status = ?, paid_at = ? WHERE booking_id = ?',
          [
            bookingData.payment_status === 'paid' ? 'paid' : bookingData.payment_status,
            bookingData.payment_status === 'paid' ? new Date() : null,
            id
          ]
        );
      }
      
      // If booking is confirmed and payment is paid, create payout record
      if (
        (bookingData.status === 'confirmed' || booking.status === 'confirmed') &&
        (bookingData.payment_status === 'paid' || booking.payment_status === 'paid')
      ) {
        // Check if payout already exists
        const payouts = await db.query(
          'SELECT * FROM payouts WHERE booking_id = ?',
          [id]
        );
        
        if (payouts.length === 0) {
          await db.query(
            'INSERT INTO payouts (provider_id, booking_id, amount, status) VALUES (?, ?, ?, ?)',
            [booking.provider_id, id, booking.provider_earnings, 'pending']
          );
        }
      }
      
      // Get updated booking
      const updatedBooking = await this.getById(id);
      
      return updatedBooking;
    } catch (error) {
      console.error('Error updating booking:', error);
      throw error;
    }
  },
  
  /**
   * Cancel a booking
   * @param {number} id - Booking ID
   * @param {string} cancelledBy - Who cancelled the booking ('user' or 'provider')
   * @returns {Promise<Object>} - Cancelled booking with refund details
   */
  async cancel(id, cancelledBy) {
    try {
      // Check if booking exists
      const booking = await this.getById(id);
      
      // Check if booking can be cancelled
      if (booking.status === 'completed') {
        throw badRequest('Completed bookings cannot be cancelled');
      }
      
      if (booking.status === 'cancelled') {
        throw badRequest('Booking is already cancelled');
      }
      
      // Format datetime strings for MySQL
      const formatDateForMySQL = (dateString) => {
        const date = new Date(dateString);
        return date.toISOString().slice(0, 19).replace('T', ' ');
      };
      
      // Get cancellation policy and calculate refund
      const cancellationDate = new Date();
      const formattedCancellationDate = formatDateForMySQL(cancellationDate);
      let refundDetails = {
        refund_percentage: 0,
        refund_amount: 0,
        policy_name: 'default'
      };
      
      // Only calculate refund if payment was made and it's the user cancelling
      // Providers typically must honor full refunds when they cancel
      if (booking.payment_status === 'paid') {
        try {
          // Get listing to find cancellation policy
          const [listing] = await db.query('SELECT cancellation_policy FROM listings WHERE id = ?', [booking.listing_id]);
          
          if (listing) {
            // Get cancellation policy details
            const [policy] = await db.query('SELECT * FROM cancellation_policies WHERE name = ?', [listing.cancellation_policy]);
            
            if (policy) {
              // Calculate days before check-in
              const bookingStart = new Date(booking.start_datetime);
              const daysDifference = Math.floor((bookingStart - cancellationDate) / (1000 * 60 * 60 * 24));
              
              // Calculate refund amount based on who cancelled and how far in advance
              if (cancelledBy === 'provider') {
                // Provider cancellations typically result in full refund
                refundDetails.refund_percentage = 100;
                refundDetails.refund_amount = booking.total_price;
              } else {
                // User cancellations follow the policy
                if (daysDifference >= policy.refund_before_days) {
                  // Cancellation is early enough for higher refund percentage
                  refundDetails.refund_percentage = policy.refund_before_percentage;
                } else if (daysDifference >= 0) {
                  // Cancellation is after the cutoff but before check-in
                  refundDetails.refund_percentage = policy.refund_after_percentage;
                } else {
                  // Cancellation after check-in (no refund)
                  refundDetails.refund_percentage = 0;
                }
                
                refundDetails.refund_amount = (booking.total_price * refundDetails.refund_percentage) / 100;
              }
              
              refundDetails.policy_name = policy.name;
            }
          }
        } catch (error) {
          console.error('Error calculating refund:', error);
          // Default to full refund if policy calculation fails
          if (cancelledBy === 'provider') {
            refundDetails.refund_percentage = 100;
            refundDetails.refund_amount = booking.total_price;
          }
        }
      }
      
      // Start a transaction
      const connection = await db.getPool().getConnection();
      await connection.beginTransaction();
      
      try {
        // Update booking status
        await connection.query(
          'UPDATE bookings SET status = ?, notes = ? WHERE id = ?',
          [
            'cancelled',
            (booking.notes || '') + `\nCancelled by ${cancelledBy} on ${formattedCancellationDate}`,
            id
          ]
        );
        
        // If payment was made, process refund based on policy
        if (booking.payment_status === 'paid' && refundDetails.refund_amount > 0) {
          // Get payment
          const [payment] = await connection.query(
            'SELECT * FROM payments WHERE booking_id = ? AND status = ?',
            [id, 'paid']
          );
          
          if (payment) {
            // Create refund record
            await connection.query(
              'INSERT INTO payments (booking_id, method, amount, status, transaction_id, paid_at) VALUES (?, ?, ?, ?, ?, ?)',
              [
                id,
                payment.method,
                -refundDetails.refund_amount, // Negative amount for refund
                'refunded',
                `refund_${payment.transaction_id || id}`,
                formattedCancellationDate
              ]
            );
            
            // Update booking payment status if full refund
            if (refundDetails.refund_amount >= booking.total_price) {
              await connection.query(
                'UPDATE bookings SET payment_status = ? WHERE id = ?',
                ['refunded', id]
              );
            }
          }
        }
        
        // Commit transaction
        await connection.commit();
        
        // Get updated booking
        const cancelledBooking = await this.getById(id);
        
        // Add refund details to the response
        return {
          ...cancelledBooking,
          cancellation: {
            date: cancellationDate,
            cancelled_by: cancelledBy,
            refund_percentage: refundDetails.refund_percentage,
            refund_amount: refundDetails.refund_amount,
            policy_name: refundDetails.policy_name
          }
        };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Error cancelling booking:', error);
      throw error;
    }
  },
  
  /**
   * Complete a booking
   * @param {number} id - Booking ID
   * @returns {Promise<Object>} - Completed booking
   */
  async complete(id) {
    try {
      // Check if booking exists
      const booking = await this.getById(id);
      
      // Check if booking can be completed
      if (booking.status !== 'confirmed') {
        throw badRequest('Only confirmed bookings can be completed');
      }
      
      if (booking.payment_status !== 'paid') {
        throw badRequest('Booking payment must be paid before completion');
      }
      
      // Format datetime strings for MySQL
      const formatDateForMySQL = (dateString) => {
        const date = new Date(dateString);
        return date.toISOString().slice(0, 19).replace('T', ' ');
      };
      
      const completedDate = formatDateForMySQL(new Date());
      
      // Update booking status
      await db.update('bookings', id, {
        status: 'completed',
        notes: booking.notes + `\nCompleted on ${completedDate}`
      });
      
      // Get updated booking
      const completedBooking = await this.getById(id);
      
      return completedBooking;
    } catch (error) {
      console.error('Error completing booking:', error);
      throw error;
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
          const unitsForDate = this.calculateUnitsForDate(
            smartPricing.unitType,
            smartPricing.duration
          );
          totalPrice += effectivePrice.price * unitsForDate;
        } else {
          // Use regular pricing for this date
          const unitsForDate = this.calculateUnitsForDate(
            smartPricing.unitType,
            smartPricing.duration
          );
          totalPrice += effectivePrice.price * unitsForDate;
        }
        
        // Move to next date based on unit type
        if (smartPricing.unitType === 'hour') {
          currentDate.setHours(currentDate.getHours() + smartPricing.duration);
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
            totalPrice += effectivePrice.price;
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
   * Calculate units for a specific date based on unit type
   * @param {string} unitType - Unit type (hour, day, night, etc.)
   * @param {number} duration - Duration in units
   * @returns {number} - Number of units
   */
  calculateUnitsForDate(unitType, duration) {
    // For most unit types, one date = one unit
    // This can be customized based on specific business logic
    switch (unitType) {
      case 'hour':
        return duration; // Duration in hours
      case 'day':
      case 'night':
      case 'week':
      case 'month':
      default:
        return 1; // One unit per date
    }
  },

  /**
   * Format a date for MySQL
   * @param {string|Date} date - Date to format
   * @returns {string} - Formatted date string
   */
  formatDateForMySQL(date) {
    if (!date) return null;
    
    const d = new Date(date);
    
    // Check if date is valid
    if (isNaN(d.getTime())) {
      throw badRequest('Invalid date format');
    }
    
    // Format without timezone conversion to preserve original time
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  },

  /**
   * Get available time slots for a specific date and listing using smart availability logic
   * @param {number} listing_id - Listing ID
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Available time slots with smart splitting around bookings
   */
  async getAvailableTimeSlots(listing_id, date) {
    try {
      // Get listing details
      const listingQuery = `
        SELECT unit_type
        FROM listings
        WHERE id = ? AND active = 1
      `;
      
      const listings = await db.query(listingQuery, [listing_id]);
      
      if (listings.length === 0) {
        throw notFound('Listing not found or inactive');
      }
      
      const listing = listings[0];
      
      // Only applicable for hourly bookings
      if (listing.unit_type !== 'hour') {
        return [];
      }
      
      // Get availability for the date
      const availabilityQuery = `
        SELECT 
          CASE 
            WHEN start_datetime IS NOT NULL THEN start_datetime
            ELSE CONCAT(date, ' ', start_time)
          END as start_time,
          CASE 
            WHEN end_datetime IS NOT NULL THEN end_datetime
            ELSE CONCAT(COALESCE(end_date, date), ' ', end_time)
          END as end_time
        FROM availability 
        WHERE listing_id = ? 
          AND is_available = 1
          AND date = ?
        ORDER BY start_time ASC
      `;
      
      const availability = await db.query(availabilityQuery, [listing_id, date]);
      
      if (availability.length === 0) {
        return [];
      }
      
      // Get existing bookings that overlap with this date
      const bookingsQuery = `
        SELECT start_datetime, end_datetime
        FROM bookings
        WHERE listing_id = ?
          AND status IN ('confirmed', 'pending')
          AND DATE(start_datetime) <= ?
          AND DATE(end_datetime) >= ?
        ORDER BY start_datetime ASC
      `;
      
      const existingBookings = await db.query(bookingsQuery, [listing_id, date, date]);
      
      // CRITICAL FIX: Also get blocked dates that overlap with this date
      const blockedDatesQuery = `
        SELECT start_datetime, end_datetime
        FROM blocked_dates
        WHERE listing_id = ?
          AND DATE(start_datetime) <= ?
          AND DATE(end_datetime) >= ?
        ORDER BY start_datetime ASC
      `;
      
      const blockedDates = await db.query(blockedDatesQuery, [listing_id, date, date]);
      
      // Combine bookings and blocked dates for unified processing
      const allBlockedPeriods = [...existingBookings, ...blockedDates];
      
      // Smart availability logic: split availability periods around bookings
      const timeSlots = [];
      
      for (const slot of availability) {
        const slotStart = new Date(slot.start_time);
        const slotEnd = new Date(slot.end_time);
        
        // Find blocked periods (bookings + blocked dates) that overlap with this availability slot
        const overlappingBlocks = allBlockedPeriods.filter(block => {
          const blockStart = new Date(block.start_datetime);
          const blockEnd = new Date(block.end_datetime);
          
          // Check if blocked period overlaps with availability slot
          return blockStart < slotEnd && blockEnd > slotStart;
        });
        
        if (overlappingBlocks.length === 0) {
          // No conflicts, add the entire availability slot
          timeSlots.push({
            start_time: slotStart.toISOString(),
            end_time: slotEnd.toISOString(),
            display_time: `${slotStart.getHours().toString().padStart(2, '0')}:${slotStart.getMinutes().toString().padStart(2, '0')} - ${slotEnd.getHours().toString().padStart(2, '0')}:${slotEnd.getMinutes().toString().padStart(2, '0')}`,
            duration_minutes: Math.round((slotEnd - slotStart) / (1000 * 60))
          });
        } else {
          // Smart splitting: create available time ranges around blocked periods (bookings + blocked dates)
          const sortedBlocks = overlappingBlocks.sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));
          
          let currentStart = slotStart;
          
          for (const block of sortedBlocks) {
            const blockStart = new Date(block.start_datetime);
            const blockEnd = new Date(block.end_datetime);
            
            // If there's a gap before this blocked period, create an available slot
            if (currentStart < blockStart) {
              const availableEnd = new Date(Math.min(blockStart.getTime(), slotEnd.getTime()));
              
              if (currentStart < availableEnd) {
                const durationMinutes = Math.round((availableEnd - currentStart) / (1000 * 60));
                
                // Only add slots that are at least 30 minutes long
                if (durationMinutes >= 30) {
                  timeSlots.push({
                    start_time: currentStart.toISOString(),
                    end_time: availableEnd.toISOString(),
                    display_time: `${currentStart.getHours().toString().padStart(2, '0')}:${currentStart.getMinutes().toString().padStart(2, '0')} - ${availableEnd.getHours().toString().padStart(2, '0')}:${availableEnd.getMinutes().toString().padStart(2, '0')}`,
                    duration_minutes: durationMinutes,
                    is_partial: true
                  });
                }
              }
            }
            
            // Move current start to after this blocked period
            currentStart = new Date(Math.max(blockEnd.getTime(), currentStart.getTime()));
          }
          
          // If there's time remaining after all blocked periods, create a final available slot
          if (currentStart < slotEnd) {
            const durationMinutes = Math.round((slotEnd - currentStart) / (1000 * 60));
            
            // Only add slots that are at least 30 minutes long
            if (durationMinutes >= 30) {
              timeSlots.push({
                start_time: currentStart.toISOString(),
                end_time: slotEnd.toISOString(),
                display_time: `${currentStart.getHours().toString().padStart(2, '0')}:${currentStart.getMinutes().toString().padStart(2, '0')} - ${slotEnd.getHours().toString().padStart(2, '0')}:${slotEnd.getMinutes().toString().padStart(2, '0')}`,
                duration_minutes: durationMinutes,
                is_partial: true
              });
            }
          }
        }
      }
      
      return timeSlots;
      
    } catch (error) {
      console.error('Error getting available time slots:', error);
      throw error;
    }
  },

  /**
   * Check for booking conflicts with existing bookings
   * @param {number} listing_id - Listing ID
   * @param {string} start_datetime - Start datetime
   * @param {string} end_datetime - End datetime
   * @param {number} exclude_booking_id - Booking ID to exclude from conflict check
   * @returns {Promise<Array>} - Conflicting bookings
   */
  async checkBookingConflicts(listing_id, start_datetime, end_datetime, exclude_booking_id = null) {
    try {
      let query = `
        SELECT b.*, u.name as user_name
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        WHERE b.listing_id = ?
          AND b.status IN ('confirmed', 'pending')
          AND (
            (b.start_datetime < ? AND b.end_datetime > ?) OR
            (b.start_datetime < ? AND b.end_datetime > ?) OR
            (b.start_datetime >= ? AND b.end_datetime <= ?)
          )
      `;
      
      const params = [
        listing_id,
        end_datetime, start_datetime,
        start_datetime, start_datetime,
        start_datetime, end_datetime
      ];
      
      if (exclude_booking_id) {
        query += ' AND b.id != ?';
        params.push(exclude_booking_id);
      }
      
      const conflicts = await db.query(query, params);
      
      return conflicts;
      
    } catch (error) {
      console.error('Error checking booking conflicts:', error);
      throw error;
    }
  },

  /**
   * Get booking statistics for a listing
   * @param {number} listing_id - Listing ID
   * @param {string} start_date - Start date for statistics
   * @param {string} end_date - End date for statistics
   * @returns {Promise<Object>} - Booking statistics
   */
  async getBookingStats(listing_id, start_date, end_date) {
    try {
      const statsQuery = `
        SELECT 
          COUNT(*) as total_bookings,
          COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_bookings,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_bookings,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_bookings,
          SUM(CASE WHEN status = 'confirmed' THEN total_price ELSE 0 END) as total_revenue,
          AVG(CASE WHEN status = 'confirmed' THEN total_price ELSE NULL END) as avg_booking_value
        FROM bookings
        WHERE listing_id = ?
          AND DATE(start_datetime) >= ?
          AND DATE(end_datetime) <= ?
      `;
      
      const stats = await db.query(statsQuery, [listing_id, start_date, end_date]);
      
      return stats[0] || {
        total_bookings: 0,
        confirmed_bookings: 0,
        pending_bookings: 0,
        cancelled_bookings: 0,
        total_revenue: 0,
        avg_booking_value: 0
      };
      
    } catch (error) {
      console.error('Error getting booking statistics:', error);
      throw error;
    }
  }
};

module.exports = bookingModel;