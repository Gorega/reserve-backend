const db = require('../config/database');
const { notFound, badRequest } = require('../utils/errorHandler');
const listingModel = require('./listingModel');

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
               p.status as payment_status,
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
               l.user_id as provider_id,
               p.id as payment_id,
               p.method as payment_method,
               p.status as payment_status,
               p.transaction_id,
               p.paid_at
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        JOIN listings l ON b.listing_id = l.id
        LEFT JOIN payments p ON b.id = p.booking_id
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
        notes
      } = bookingData;
      
      // Format dates for MySQL
      const formattedStartDatetime = this.formatDateForMySQL(start_datetime);
      const formattedEndDatetime = this.formatDateForMySQL(end_datetime);
      
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
      const durationInMs = endDate - startDate;
      const durationInHours = durationInMs / (1000 * 60 * 60);
      const durationInDays = durationInMs / (1000 * 60 * 60 * 24);
      
      let totalPrice = 0;
      
      if (booking_type === 'hourly' || booking_type === 'session' || booking_type === 'appointment') {
        totalPrice = listing.price_per_hour * Math.ceil(durationInHours);
      } else if (booking_type === 'daily') {
        totalPrice = listing.price_per_day * Math.ceil(durationInDays);
      } else if (booking_type === 'subscription') {
        // For subscriptions, use the price_per_day field as the subscription price
        totalPrice = listing.price_per_day;
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
      
      // Insert booking
      const bookingResult = await db.query(
        `INSERT INTO bookings (
          listing_id, user_id, start_datetime, end_datetime, booking_type,
          guests_count, total_price, deposit_amount, remaining_amount,
          platform_commission, provider_earnings, user_service_fee,
          status, payment_status, deposit_deadline, auto_cancel_at, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          notes || null
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
    
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }
};

module.exports = bookingModel; 