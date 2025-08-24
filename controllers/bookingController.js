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
      
      // Debug user information
      console.log('User info:', {
        id: req.user.id,
        is_provider: req.user.is_provider,
        email: req.user.email
      });
      
      // FIXED: Users can be both providers AND customers
      // Show bookings where they are either the customer OR the provider
      if (req.user.is_provider) {
        // For providers, show bookings for their listings AND bookings they made as customers
        filters.user_or_provider_id = req.user.id;
        console.log('Filtering by user_or_provider_id:', req.user.id);
      } else {
        // For regular users, only show their bookings as customers
        filters.user_id = req.user.id;
        console.log('Filtering by user_id:', req.user.id);
      }
      
      console.log('Applied filters:', filters);
      
      // TEMPORARY: Test without user filtering to see if data is returned
      const testFilters = { ...filters };
      delete testFilters.user_id;
      delete testFilters.provider_id;
      console.log('Testing with filters (no user filtering):', testFilters);
      
      // Get bookings
      const bookings = await bookingModel.getAll(filters, page, limit);
      
      // Add unit_type to each booking for frontend compatibility
      bookings.forEach(booking => {
        // Make sure unit_type is always available
        booking.unit_type = booking.listing_unit_type || 'hour';
      });
      
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
      const totalCount = countResult[0].total;
      
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
      const { id } = req.params;
      const bookingData = req.body;
      
      // Get booking to check permissions
      const booking = await bookingModel.getById(id);
      
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
      
      const updatedBooking = await bookingModel.update(id, bookingData);
      
      res.status(200).json({
        status: 'success',
        data: updatedBooking
      });
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
  }
};

module.exports = bookingController; 