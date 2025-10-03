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
   * Verify webhook signature using HMAC-SHA256
   * @param {string} payload - Raw request body
   * @param {string} signature - Signature from header
   * @param {string} secret - Webhook secret
   * @returns {boolean} - True if signature is valid
   */
  verifyWebhookSignature(payload, signature, secret) {
    try {
      const crypto = require('crypto');
      
      // Calculate expected signature
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload, 'utf8')
        .digest('hex');

      // Compare signatures using constant-time comparison to prevent timing attacks
      const providedSignature = signature.replace(/^sha256=/, ''); // Remove prefix if present
      
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(providedSignature, 'hex')
      );
    } catch (error) {
      console.error('Error verifying webhook signature:', error);
      return false;
    }
  },

  /**
   * Process payment from Lahza payment gateway webhook
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async processPayment(req, res, next) {
    try {
      console.log('Lahza Webhook received:', {
        method: req.method,
        headers: req.headers,
        body: req.body,
        query: req.query
      });

      // Handle both GET and POST requests
      // For GET requests, data comes in query parameters
      // For POST requests, data comes in request body
      let webhookData;
      if (req.method === 'GET') {
        webhookData = req.query;
        console.log('Processing GET webhook with query parameters');
        
        // If it's a simple GET request without parameters, return a test response
        if (Object.keys(webhookData).length === 0) {
          return res.status(200).json({
            status: 'success',
            message: 'Lahza webhook endpoint is accessible',
            timestamp: new Date().toISOString()
          });
        }
      } else {
        webhookData = req.body;
        console.log('Processing POST webhook with body data');
      }

      // Verify webhook signature if secret is configured (only for POST requests)
      const webhookSecret = process.env.LAHZA_WEBHOOK_SECRET;
      if (webhookSecret && req.method === 'POST') {
        const signature = req.headers['x-lahza-signature'] || req.headers['x-signature'] || req.headers['signature'];
        const rawBody = req.rawBody || JSON.stringify(req.body);
        
        if (!signature) {
          console.log('Missing webhook signature');
          return res.status(401).json({
            status: 'error',
            message: 'Missing webhook signature'
          });
        }

        if (!this.verifyWebhookSignature(rawBody, signature, webhookSecret)) {
          console.log('Invalid webhook signature');
          return res.status(401).json({
            status: 'error',
            message: 'Invalid webhook signature'
          });
        }

        console.log('Webhook signature verified successfully');
      } else if (req.method === 'GET') {
        console.log('GET request - skipping signature verification');
      } else {
        console.log('Warning: LAHZA_WEBHOOK_SECRET not configured, skipping signature verification');
      }
      
      // Extract relevant data from Lahza webhook
      // Lahza typically sends: reference, status, amount, etc.
      const {
        reference,
        status,
        amount,
        transaction_id,
        access_code,
        customer_email,
        customer_phone,
        payment_method,
        currency,
        created_at,
        paid_at
      } = webhookData;

      console.log('Extracted webhook data:', {
        reference,
        status,
        amount,
        transaction_id,
        access_code
      });

      // Validate required fields
      if (!reference) {
        console.log('Missing reference in webhook payload');
        return res.status(400).json({
          status: 'error',
          message: 'Missing reference in webhook payload'
        });
      }

      // Map Lahza status to our internal status
      let internalStatus = 'pending';
      switch (status?.toLowerCase()) {
        case 'success':
        case 'successful':
        case 'completed':
        case 'paid':
          internalStatus = 'deposit_paid';
          break;
        case 'failed':
        case 'cancelled':
        case 'canceled':
        case 'declined':
          internalStatus = 'failed';
          break;
        case 'pending':
        case 'processing':
          internalStatus = 'pending';
          break;
        default:
          internalStatus = 'pending';
      }

      console.log('Mapped status:', { original: status, internal: internalStatus });

      // Try to find payment by Lahza reference/transaction ID
      // We'll need to search by the reference we stored when creating the payment
      let payment = null;
      
      // First try to find by our stored reference
      try {
        // This assumes we have a method to find by external reference
        // We might need to add this to the payment model
        payment = await paymentModel.getByReference(reference);
      } catch (error) {
        console.log('Could not find payment by reference, trying transaction_id');
      }

      // If not found by reference, try by transaction_id
      if (!payment && transaction_id) {
        try {
          payment = await paymentModel.getByTransactionId(transaction_id);
        } catch (error) {
          console.log('Could not find payment by transaction_id');
        }
      }

      // If still not found, this might be a direct payment without pre-created record
      if (!payment) {
        console.log('Payment record not found, webhook might be for direct payment');
        
        // For now, just acknowledge the webhook
        return res.status(200).json({
          status: 'success',
          message: 'Webhook received but no matching payment record found'
        });
      }

      console.log('Found payment record:', payment.id);

      // Update payment data
      const paymentData = {
        status: internalStatus,
        transaction_id: transaction_id || reference,
        lahza_reference: reference,
        lahza_access_code: access_code,
        amount: amount || payment.amount,
        currency: currency || 'SAR',
        payment_method: payment_method || 'card'
      };

      // If payment is completed, set paid_at timestamp
      if (internalStatus === 'deposit_paid' || internalStatus === 'fully_paid') {
        paymentData.paid_at = paid_at ? new Date(paid_at) : new Date();
      }

      console.log('Updating payment with data:', paymentData);

      // Update payment
      const updatedPayment = await paymentModel.update(payment.id, paymentData);

      // Update booking payment status if payment is linked to a booking
      if (payment.booking_id) {
        if (internalStatus === 'deposit_paid') {
          await bookingModel.update(payment.booking_id, {
            payment_status: 'deposit_paid',
            status: 'confirmed',
            auto_cancel_at: null // Remove auto-cancellation once deposit is paid
          });
          console.log('Updated booking status to confirmed');
        } else if (internalStatus === 'fully_paid') {
          await bookingModel.update(payment.booking_id, {
            payment_status: 'fully_paid'
          });
          console.log('Updated booking status to fully paid');
        } else if (internalStatus === 'failed') {
          await bookingModel.update(payment.booking_id, {
            payment_status: 'failed',
            status: 'cancelled'
          });
          console.log('Updated booking status to cancelled due to failed payment');
        }
      }

      console.log('Webhook processed successfully');

      res.status(200).json({
        status: 'success',
        message: 'Webhook processed successfully',
        data: {
          payment_id: payment.id,
          status: internalStatus,
          reference: reference
        }
      });
    } catch (error) {
      console.error('Webhook processing error:', error);
      
      // Always return 200 to prevent webhook retries for application errors
      res.status(200).json({
        status: 'error',
        message: 'Webhook processing failed',
        error: error.message
      });
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