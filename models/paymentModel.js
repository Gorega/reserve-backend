const db = require('../config/database');
const { notFound, badRequest } = require('../utils/errorHandler');

/**
 * Payment Model
 * Handles all database operations for payments
 */
const paymentModel = {
  /**
   * Get all payments with optional filtering
   * @param {Object} filters - Optional filters
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Array>} - List of payments
   */
  async getAll(filters = {}, page = 1, limit = 10) {
    try {
      const offset = (page - 1) * limit;
      
      let query = `
        SELECT p.*, b.start_datetime, b.end_datetime, 
               u.name as user_name, l.title as listing_title
        FROM payments p
        JOIN bookings b ON p.booking_id = b.id
        JOIN users u ON b.user_id = u.id
        JOIN listings l ON b.listing_id = l.id
      `;
      
      const params = [];
      
      // Add filters if provided
      if (Object.keys(filters).length > 0) {
        const filterConditions = [];
        
        if (filters.booking_id) {
          filterConditions.push('p.booking_id = ?');
          params.push(filters.booking_id);
        }
        
        if (filters.status) {
          filterConditions.push('p.status = ?');
          params.push(filters.status);
        }
        
        if (filters.method) {
          filterConditions.push('p.method = ?');
          params.push(filters.method);
        }
        
        if (filters.user_id) {
          filterConditions.push('b.user_id = ?');
          params.push(filters.user_id);
        }
        
        if (filters.provider_id) {
          filterConditions.push('l.user_id = ?');
          params.push(filters.provider_id);
        }
        
        if (filterConditions.length > 0) {
          query += ' WHERE ' + filterConditions.join(' AND ');
        }
      }
      
      // Add sorting and pagination
      query += ' ORDER BY p.paid_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      const payments = await db.query(query, params);
      return payments;
    } catch (error) {
      console.error('Error getting payments:', error);
      throw error;
    }
  },
  
  /**
   * Get payment by ID
   * @param {number} id - Payment ID
   * @returns {Promise<Object>} - Payment object
   */
  async getById(id) {
    try {
      const query = `
        SELECT p.*, b.start_datetime, b.end_datetime, 
               u.name as user_name, l.title as listing_title,
               pl.name as payment_location_name, pl.address as payment_location_address
        FROM payments p
        JOIN bookings b ON p.booking_id = b.id
        JOIN users u ON b.user_id = u.id
        JOIN listings l ON b.listing_id = l.id
        LEFT JOIN payment_locations pl ON p.payment_location_id = pl.id
        WHERE p.id = ?
      `;
      
      const payments = await db.query(query, [id]);
      
      if (payments.length === 0) {
        throw notFound('Payment not found');
      }
      
      return payments[0];
    } catch (error) {
      console.error('Error getting payment by ID:', error);
      throw error;
    }
  },
  
  /**
   * Create a new payment
   * @param {Object} paymentData - Payment data
   * @returns {Promise<Object>} - Created payment
   */
  async create(paymentData) {
    try {
      // Get booking details to calculate confirmation fee
      const bookingQuery = `SELECT * FROM bookings WHERE id = ?`;
      const bookings = await db.query(bookingQuery, [paymentData.booking_id]);
      
      if (bookings.length === 0) {
        throw notFound('Booking not found');
      }
      
      const booking = bookings[0];
      
      // Calculate confirmation fee (10% of total price)
      const confirmationFeePercent = 10;
      const confirmationFee = (booking.total_price * confirmationFeePercent) / 100;
      
      // Set payment amount to confirmation fee only
      const updatedPaymentData = {
        ...paymentData,
        amount: confirmationFee,
        deposit_amount: confirmationFee,
        remaining_amount: booking.total_price - confirmationFee
      };
      
      const result = await db.insert('payments', updatedPaymentData);
      
      if (result.affectedRows === 0) {
        throw badRequest('Failed to create payment');
      }
      
      return this.getById(result.insertId);
    } catch (error) {
      console.error('Error creating payment:', error);
      throw error;
    }
  },
  
  /**
   * Update payment status
   * @param {number} id - Payment ID
   * @param {Object} paymentData - Payment data to update
   * @returns {Promise<Object>} - Updated payment
   */
  async update(id, paymentData) {
    try {
      const result = await db.update('payments', id, paymentData);
      
      if (result.affectedRows === 0) {
        throw notFound('Payment not found');
      }
      
      return this.getById(id);
    } catch (error) {
      console.error('Error updating payment:', error);
      throw error;
    }
  },
  
  /**
   * Get payment by reference
   * @param {string} reference - Payment reference
   * @returns {Promise<Object|null>} - Payment object or null if not found
   */
  async getByReference(reference) {
    try {
      const query = `
        SELECT p.*, b.start_datetime, b.end_datetime, 
               u.name as user_name, l.title as listing_title,
               pl.name as payment_location_name, pl.address as payment_location_address
        FROM payments p
        JOIN bookings b ON p.booking_id = b.id
        JOIN users u ON b.user_id = u.id
        JOIN listings l ON b.listing_id = l.id
        LEFT JOIN payment_locations pl ON p.payment_location_id = pl.id
        WHERE p.reference = ?
      `;
      
      const payments = await db.query(query, [reference]);
      return payments.length > 0 ? payments[0] : null;
    } catch (error) {
      console.error('Error getting payment by reference:', error);
      throw error;
    }
  },

  /**
   * Get payment by transaction ID
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object|null>} - Payment object or null if not found
   */
  async getByTransactionId(transactionId) {
    try {
      const query = `
        SELECT p.*, b.start_datetime, b.end_datetime, 
               u.name as user_name, l.title as listing_title,
               pl.name as payment_location_name, pl.address as payment_location_address
        FROM payments p
        JOIN bookings b ON p.booking_id = b.id
        JOIN users u ON b.user_id = u.id
        JOIN listings l ON b.listing_id = l.id
        LEFT JOIN payment_locations pl ON p.payment_location_id = pl.id
        WHERE p.transaction_id = ?
      `;
      
      const payments = await db.query(query, [transactionId]);
      return payments.length > 0 ? payments[0] : null;
    } catch (error) {
      console.error('Error getting payment by transaction ID:', error);
      throw error;
    }
  },

  /**
   * Get payment locations
   * @returns {Promise<Array>} - List of payment locations
   */
  async getPaymentLocations() {
    try {
      const query = `
        SELECT * FROM payment_locations
        WHERE is_active = 1
      `;
      
      return await db.query(query);
    } catch (error) {
      console.error('Error getting payment locations:', error);
      throw error;
    }
  }
};

module.exports = paymentModel;