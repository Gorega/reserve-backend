const paymentModel = require('../models/paymentModel');
const bookingModel = require('../models/bookingModel');
const { serverError, notFound, badRequest } = require('../utils/errorHandler');

/**
 * Payment Controller
 * Handles HTTP requests for payment operations
 */
const paymentController = {
  /**
   * Get all payments (admin only)
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
      if (req.query.booking_id) filters.booking_id = parseInt(req.query.booking_id);
      if (req.query.status) filters.status = req.query.status;
      if (req.query.method) filters.method = req.query.method;
      
      // Get payments
      const payments = await paymentModel.getAll(filters, page, limit);
      
      res.status(200).json({
        status: 'success',
        results: payments.length,
        data: payments
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Get user payments
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getUserPayments(req, res, next) {
    try {
      // Parse query parameters
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const filters = {
        user_id: req.user.id
      };
      
      // Get payments
      const payments = await paymentModel.getAll(filters, page, limit);
      
      res.status(200).json({
        status: 'success',
        results: payments.length,
        data: payments
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Get host payments
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getHostPayments(req, res, next) {
    try {
      // Parse query parameters
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const filters = {
        provider_id: req.user.id
      };
      
      // Get payments
      const payments = await paymentModel.getAll(filters, page, limit);
      
      res.status(200).json({
        status: 'success',
        results: payments.length,
        data: payments
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Get payment by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const payment = await paymentModel.getById(id);
      
      // Get the booking to check authorization
      const booking = await bookingModel.getById(payment.booking_id);
      
      // Check if user is authorized to view this payment
      if (booking.user_id !== req.user.id && booking.provider_id !== req.user.id && !req.user.is_admin) {
        return res.status(403).json({
          status: 'error',
          message: 'You are not authorized to access this payment'
        });
      }
      
      res.status(200).json({
        status: 'success',
        data: payment
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Create a new payment
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async create(req, res, next) {
    try {
      const { booking_id, method, payment_location_id } = req.body;
      
      // Validate booking exists and belongs to user
      const booking = await bookingModel.getById(booking_id);
      
      if (!booking) {
        return res.status(404).json({
          status: 'error',
          message: 'Booking not found'
        });
      }
      
      if (booking.user_id !== req.user.id) {
        return res.status(403).json({
          status: 'error',
          message: 'You are not authorized to make payments for this booking'
        });
      }
      
      // Calculate confirmation fee (10% of total price)
      const confirmationFeePercent = 10;
      const confirmationFee = (booking.total_price * confirmationFeePercent) / 100;
      
      // Set payment deadline for cash deposits (12 hours from now)
      let payment_deadline = null;
      if (method === 'cash') {
        const deadline = new Date();
        deadline.setHours(deadline.getHours() + 12);
        payment_deadline = deadline;
      }
      
      // Create payment
      const paymentData = {
        booking_id,
        method,
        amount: confirmationFee,
        deposit_amount: confirmationFee,
        remaining_amount: booking.total_price - confirmationFee,
        payment_location_id: payment_location_id || null,
        payment_deadline,
        status: method === 'cash' ? 'pending' : 'deposit_paid'
      };
      
      const payment = await paymentModel.create(paymentData);
      
      // Update booking status based on payment method
      if (method === 'card') {
        // For card payments, mark deposit as paid immediately
        await bookingModel.update(booking_id, {
          payment_status: 'deposit_paid',
          status: 'confirmed'
        });
      } else if (method === 'cash') {
        // For cash payments, set deposit deadline and auto-cancel time
        await bookingModel.update(booking_id, {
          deposit_amount: confirmationFee,
          remaining_amount: booking.total_price - confirmationFee,
          deposit_deadline: payment_deadline,
          auto_cancel_at: payment_deadline
        });
      }
      
      res.status(201).json({
        status: 'success',
        data: payment
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Update payment status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updateStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, transaction_id } = req.body;
      
      // Get the payment
      const payment = await paymentModel.getById(id);
      
      // Only admin can update payment status
      if (!req.user.is_admin) {
        return res.status(403).json({
          status: 'error',
          message: 'You are not authorized to update payment status'
        });
      }
      
      // Update payment data
      const paymentData = {
        status,
        transaction_id: transaction_id || payment.transaction_id
      };
      
      // If payment is completed, set paid_at timestamp
      if (status === 'deposit_paid' || status === 'fully_paid') {
        paymentData.paid_at = new Date();
      }
      
      // Update payment
      const updatedPayment = await paymentModel.update(id, paymentData);
      
      // Update booking payment status
      if (status === 'deposit_paid') {
        await bookingModel.update(payment.booking_id, {
          payment_status: 'deposit_paid',
          status: 'confirmed',
          auto_cancel_at: null // Remove auto-cancellation once deposit is paid
        });
      } else if (status === 'fully_paid') {
        await bookingModel.update(payment.booking_id, {
          payment_status: 'fully_paid'
        });
      } else if (status === 'refunded') {
        await bookingModel.update(payment.booking_id, {
          payment_status: 'refunded'
        });
      }
      
      res.status(200).json({
        status: 'success',
        data: updatedPayment
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Process payment from payment gateway webhook
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async processPayment(req, res, next) {
    try {
      const { payment_id, status, transaction_id } = req.body;
      
      // Get the payment
      const payment = await paymentModel.getById(payment_id);
      
      if (!payment) {
        return res.status(404).json({
          status: 'error',
          message: 'Payment not found'
        });
      }
      
      // Update payment data
      const paymentData = {
        status,
        transaction_id
      };
      
      // If payment is completed, set paid_at timestamp
      if (status === 'deposit_paid' || status === 'fully_paid') {
        paymentData.paid_at = new Date();
      }
      
      // Update payment
      const updatedPayment = await paymentModel.update(payment_id, paymentData);
      
      // Update booking payment status
      if (status === 'deposit_paid') {
        await bookingModel.update(payment.booking_id, {
          payment_status: 'deposit_paid',
          status: 'confirmed',
          auto_cancel_at: null // Remove auto-cancellation once deposit is paid
        });
      } else if (status === 'fully_paid') {
        await bookingModel.update(payment.booking_id, {
          payment_status: 'fully_paid'
        });
      }
      
      res.status(200).json({
        status: 'success',
        data: updatedPayment
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Get payment locations
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getPaymentLocations(req, res, next) {
    try {
      const locations = await paymentModel.getPaymentLocations();
      
      res.status(200).json({
        status: 'success',
        results: locations.length,
        data: locations
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = paymentController; 