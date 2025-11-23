const bookingModel = require('../models/bookingModel');
const listingModel = require('../models/listingModel');
const { badRequest } = require('../utils/errorHandler');
const db = require('../config/database');

/**
 * Booking Controller
 * Handles HTTP requests for booking operations
 */
const bookingController = {
  /**
   * Get all bookings
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
      if (req.query.listing_id) filters.listing_id = parseInt(req.query.listing_id);
      if (req.query.status) filters.status = req.query.status;
      if (req.query.payment_status) filters.payment_status = req.query.payment_status;
      if (req.query.start_date) filters.start_date = req.query.start_date;
      if (req.query.end_date) filters.end_date = req.query.end_date;
      
      // Filter by user role - add validation
      if (!req.user || !req.user.id) {
        return next(badRequest('User authentication required'));
      }
      
      // FIXED: Users can be both providers AND customers
      // Show bookings where they are either the customer OR the provider
      if (req.user.is_provider) {
        // For providers, show bookings for their listings AND bookings they made as customers
        filters.user_or_provider_id = req.user.id;
      } else {
        // For regular users, only show their bookings as customers
        filters.user_id = req.user.id;
      }
      
      // Get bookings from the model
      const bookings = await bookingModel.getAll(filters, page, limit);
      
      // Build count query - use the same structure as in the model
      let countQuery = `
        SELECT COUNT(*) as total
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        JOIN listings l ON b.listing_id = l.id
      `;
      
      const countParams = [];
      
      // Add filters if provided
      if (Object.keys(filters).length > 0) {
        const filterConditions = [];
        
        if (filters.user_id) {
          filterConditions.push('b.user_id = ?');
          countParams.push(Number(filters.user_id));
        }
        
        if (filters.listing_id) {
          filterConditions.push('b.listing_id = ?');
          countParams.push(Number(filters.listing_id));
        }
        
        if (filters.provider_id) {
          filterConditions.push('l.user_id = ?');
          countParams.push(Number(filters.provider_id));
        }
        
        if (filters.user_or_provider_id) {
          filterConditions.push('(b.user_id = ? OR l.user_id = ?)');
          countParams.push(Number(filters.user_or_provider_id));
          countParams.push(Number(filters.user_or_provider_id));
        }
        
        if (filters.status) {
          filterConditions.push('b.status = ?');
          countParams.push(String(filters.status));
        }
        
        if (filters.payment_status) {
          filterConditions.push('b.payment_status = ?');
          countParams.push(String(filters.payment_status));
        }
        
        if (filters.start_date) {
          filterConditions.push('DATE(b.start_datetime) >= ?');
          countParams.push(String(filters.start_date));
        }
        
        if (filters.end_date) {
          filterConditions.push('DATE(b.end_datetime) <= ?');
          countParams.push(String(filters.end_date));
        }
        
        if (filterConditions.length > 0) {
          countQuery += ' WHERE ' + filterConditions.join(' AND ');
        }
      }
      
      // Execute count query
      const countResult = await db.query(countQuery, countParams);
      const totalCount = countResult && countResult[0] ? countResult[0].total : 0;
      
      res.status(200).json({
        status: 'success',
        results: bookings.length,
        totalCount,
        page,
        totalPages: Math.ceil(totalCount / limit),
        data: bookings
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Get booking by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const booking = await bookingModel.getById(id);
      
      // Check if user has permission to view this booking
      if (
        booking.user_id !== req.user.id &&
        booking.provider_id !== req.user.id &&
        !req.user.is_admin
      ) {
        return next(badRequest('You do not have permission to view this booking'));
      }
      
      // Make sure unit_type is always available for frontend compatibility
      booking.unit_type = booking.listing_unit_type || booking.unit_type || 'hour';
      
      res.status(200).json({
        status: 'success',
        data: booking
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Create a new booking
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async create(req, res, next) {
    try {
      const bookingData = req.body;
      
      // Set user ID from authenticated user
      bookingData.user_id = req.user.id;
      
      // Validate listing exists
      const listing = await listingModel.getById(bookingData.listing_id);
      
      // Check if user is trying to book their own listing
      if (listing.user_id === req.user.id) {
        return next(badRequest('You cannot book your own listing'));
      }

      // For appointment bookings, automatically set host_id from the listing if not provided
      if (bookingData.booking_type === 'appointment') {
        if (!bookingData.host_id) {
          // Use the listing's user_id as the host_id
          bookingData.host_id = listing.user_id;
        }
      }
      
      const booking = await bookingModel.create(bookingData);
      
      res.status(201).json({
        status: 'success',
        data: booking
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Update a booking
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async update(req, res, next) {
    try {
      // Simply pass the request to the model's updateBooking method
      await bookingModel.updateBooking(req, res, next);
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Cancel a booking
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async cancel(req, res, next) {
    try {
      const { id } = req.params;
      
      // Get booking to check permissions
      const booking = await bookingModel.getById(id);
      
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
      
      // Use the model method directly instead of the controller method to avoid circular reference
      const cancelledBooking = await bookingModel.cancel(id, cancelledBy);
      
      res.status(200).json({
        status: 'success',
        data: cancelledBooking
      });
    } catch (error) {
      next(error);
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
      if (booking.payment_status === 'fully_paid') {
        return next(badRequest('Booking is already paid'));
      }
      
      // Update payment status
      const updatedBooking = await bookingModel.update(id, {
        payment_status: 'fully_paid'
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

module.exports = bookingController;