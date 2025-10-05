const paymentModel = require('../models/paymentModel');
const bookingModel = require('../models/bookingModel');
const lahzaService = require('../utils/lahzaService');
const { serverError, notFound, badRequest } = require('../utils/errorHandler');
const db = require('../config/database');

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
      // Lahza sends data in a nested structure: { data: { ... }, event: '...' }
      const paymentData = webhookData.data || webhookData;
      const event = webhookData.event;
      
      console.log('Payment data extracted:', paymentData);
      console.log('Event type:', event);
      
      const {
        reference,
        status,
        amount,
        id: transaction_id,
        gateway_response,
        customer,
        authorization,
        access_code,
        currency,
        createdAt: created_at,
        paidAt: paid_at,
        metadata,
        fees,
        channel: payment_method
      } = paymentData;

      // Extract customer information if available
      const customer_email = customer?.email;
      const customer_phone = customer?.phone;

      // Parse metadata if available
      let parsedMetadata = {};
      console.log('Raw metadata received:', metadata, 'Type:', typeof metadata);
      if (metadata) {
        try {
          if (typeof metadata === 'string') {
            parsedMetadata = JSON.parse(metadata);
          } else if (typeof metadata === 'object') {
            parsedMetadata = metadata;
          }
          console.log('Parsed metadata:', parsedMetadata);
        } catch (error) {
          console.log('Error parsing metadata:', error);
        }
      } else {
        console.log('No metadata found in webhook payload');
      }

      console.log('Extracted webhook data:', {
        reference,
        status,
        amount,
        transaction_id,
        gateway_response,
        customer_email,
        customer_phone,
        payment_method,
        currency,
        event,
        metadata: parsedMetadata
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

      // If still not found, check if we have booking metadata to create the booking
      if (!payment) {
        console.log('Payment record not found, checking for booking metadata');
        
        // Try to parse metadata for booking information
        let bookingMetadata = null;
        console.log('Attempting to extract booking metadata from:', {
          metadata: metadata,
          parsedMetadata: parsedMetadata,
          metadataType: typeof metadata,
          parsedMetadataType: typeof parsedMetadata
        });
        
        try {
          if (metadata && typeof metadata === 'string') {
            bookingMetadata = JSON.parse(metadata);
          } else if (metadata && typeof metadata === 'object') {
            bookingMetadata = metadata;
          } else if (parsedMetadata && Object.keys(parsedMetadata).length > 0) {
            bookingMetadata = parsedMetadata;
          }
          
          console.log('Extracted booking metadata:', bookingMetadata);
        } catch (error) {
          console.log('Could not parse metadata:', error);
        }
        
        // If we have booking metadata and payment is successful, create the booking
        console.log('Checking booking metadata conditions:', {
          hasBookingMetadata: !!bookingMetadata,
          hasBookingData: !!(bookingMetadata && bookingMetadata.booking_data),
          hasDirectMetadata: !!(bookingMetadata && bookingMetadata.listing_id && bookingMetadata.user_id),
          internalStatus: internalStatus,
          isSuccessfulPayment: (internalStatus === 'deposit_paid' || internalStatus === 'fully_paid')
        });
        
        // Check if we have booking metadata in the expected format or direct metadata
        const hasValidBookingData = (bookingMetadata && bookingMetadata.booking_data) || 
                                   (bookingMetadata && bookingMetadata.listing_id && bookingMetadata.user_id);
        
        if (bookingMetadata && hasValidBookingData && (internalStatus === 'deposit_paid' || internalStatus === 'fully_paid')) {
          console.log('Creating booking from webhook metadata for successful payment');
          
          try {
            // Prepare booking data from metadata
            let bookingData;
            
            if (bookingMetadata.booking_data) {
              // Use structured booking data
              bookingData = bookingMetadata.booking_data;
              
              // Ensure datetime fields are properly combined if they're separate
              if (!bookingData.start_datetime && bookingData.start_date && bookingData.start_time) {
                bookingData.start_datetime = `${bookingData.start_date} ${bookingData.start_time}`;
                console.log(`Combined start_datetime from booking_data: ${bookingData.start_datetime}`);
              }
              
              if (!bookingData.end_datetime && bookingData.end_date && bookingData.end_time) {
                bookingData.end_datetime = `${bookingData.end_date} ${bookingData.end_time}`;
                console.log(`Combined end_datetime from booking_data: ${bookingData.end_datetime}`);
              }
            } else {
              // Create booking data from direct metadata
              // First, check if there's an existing booking for this payment reference
              let existingBooking = null;
              
              console.log('DEBUG: Looking for existing booking with reference:', reference);
              console.log('DEBUG: Booking metadata:', {
                user_id: bookingMetadata.user_id,
                listing_id: bookingMetadata.listing_id
              });
              
              try {
                // Try to find existing booking by reference or user/listing combination
                const bookingModel = require('../models/bookingModel');
                
                // Look for existing bookings with this reference in notes
                const pool = await db.getPool();
                const searchPattern = `%${reference}%`;
                console.log('DEBUG: Searching for bookings with pattern:', searchPattern);
                
                const [existingBookings] = await pool.execute(
                  'SELECT * FROM bookings WHERE notes LIKE ? AND user_id = ? AND listing_id = ? ORDER BY created_at DESC LIMIT 1',
                  [searchPattern, bookingMetadata.user_id, bookingMetadata.listing_id]
                );
                
                console.log('DEBUG: Found', existingBookings.length, 'existing bookings');
                
                if (existingBookings.length > 0) {
                  existingBooking = existingBookings[0];
                  console.log('Found existing booking with reference:', existingBooking.id);
                  console.log('Existing booking details:', {
                    id: existingBooking.id,
                    start_datetime: existingBooking.start_datetime,
                    end_datetime: existingBooking.end_datetime,
                    notes: existingBooking.notes
                  });
                } else {
                  console.log('DEBUG: No existing booking found, will create new one');
                  
                  // Also try to find any booking for this user/listing combination
                  const [anyBookings] = await pool.execute(
                    'SELECT id, notes, created_at FROM bookings WHERE user_id = ? AND listing_id = ? ORDER BY created_at DESC LIMIT 3',
                    [bookingMetadata.user_id, bookingMetadata.listing_id]
                  );
                  console.log('DEBUG: Recent bookings for this user/listing:', anyBookings.map(b => ({
                    id: b.id,
                    notes: b.notes,
                    created_at: b.created_at
                  })));
                }
              } catch (error) {
                console.log('Could not find existing booking:', error.message);
                console.log('DEBUG: Database error details:', error);
              }
              
              // If we found an existing booking, use its datetime information
              if (existingBooking) {
                console.log('Using datetime from existing booking:', {
                  start_datetime: existingBooking.start_datetime,
                  end_datetime: existingBooking.end_datetime
                });
                
                // Update the existing booking's payment status instead of creating a new one
                const bookingModel = require('../models/bookingModel');
                await bookingModel.update(existingBooking.id, {
                  payment_status: internalStatus,
                  status: internalStatus === 'deposit_paid' ? 'confirmed' : existingBooking.status
                });
                
                console.log(`Updated existing booking ${existingBooking.id} payment status to ${internalStatus}`);
                
                return res.status(200).json({
                  status: 'success',
                  message: 'Existing booking payment status updated',
                  booking_id: existingBooking.id
                });
              }
              
              // If no existing booking found, we need to get additional information from the listing
              const listingModel = require('../models/listingModel');
              const listing = await listingModel.getById(bookingMetadata.listing_id);
              
              if (!listing) {
                throw new Error(`Listing not found: ${bookingMetadata.listing_id}`);
              }
              
              // Extract dates from metadata if available
              const startDate = bookingMetadata.start_date || bookingMetadata.selected_date || new Date().toISOString().split('T')[0];
              const endDate = bookingMetadata.end_date || startDate;
              const startTime = bookingMetadata.start_time;
              const endTime = bookingMetadata.end_time;
              const bookingPeriod = bookingMetadata.booking_period || bookingMetadata.period || 'full_day';
              
              const bookingType = bookingMetadata.booking_type || 'daily';
              
              // Create basic booking data structure
              bookingData = {
                listing_id: bookingMetadata.listing_id,
                user_id: bookingMetadata.user_id,
                host_id: bookingMetadata.host_id || listing.user_id,
                selected_date: startDate,
                start_date: startDate,
                end_date: endDate,
                booking_period: bookingPeriod,
                booking_type: bookingMetadata.booking_type || 'daily',
                guests_count: bookingMetadata.guests_count || bookingMetadata.guest_count || 1,
                total_price: bookingMetadata.total_price || bookingMetadata.total_amount || bookingMetadata.amount,
                payment_status: internalStatus,
                status: internalStatus === 'deposit_paid' ? 'confirmed' : 'pending',
                notes: `Booking created via Lahza payment webhook. Reference: ${reference}${access_code ? `, Access Code: ${access_code}` : ''}`,
                is_webhook_booking: true,
                source: 'webhook'
              };
              
              // Combine date and time if available separately
              if (bookingData.start_date && bookingData.start_time) {
                bookingData.start_datetime = `${bookingData.start_date} ${bookingData.start_time}`;
                console.log(`Combined start_datetime: ${bookingData.start_datetime}`);
              }
              
              if (bookingData.end_date && bookingData.end_time) {
                bookingData.end_datetime = `${bookingData.end_date} ${bookingData.end_time}`;
                console.log(`Combined end_datetime: ${bookingData.end_datetime}`);
              }
              
              console.log('Created booking data from direct metadata:', bookingData);
            }
            
            // Add webhook flag to indicate this is a webhook-created booking
            bookingData.is_webhook_booking = true;
            bookingData.source = 'webhook';
            
            // Create the booking using the prepared data
            const booking = await bookingModel.create(bookingData);
            console.log('Successfully created booking from webhook:', booking.id);
            
            // The booking model automatically created a payment record
            // Now update it with Lahza-specific fields
            const [payments] = await db.query(
              'SELECT id FROM payments WHERE booking_id = ? ORDER BY id DESC LIMIT 1',
              [booking.id]
            );
            
            if (payments.length > 0) {
              const paymentId = payments[0].id;
              
              // Update the payment record with Lahza-specific fields
              await db.query(
                'UPDATE payments SET transaction_id = ?, lahza_reference = ?, lahza_access_code = ?, currency = ?, paid_at = ? WHERE id = ?',
                [
                  transaction_id || reference,
                  reference,
                  access_code,
                  currency || 'SAR',
                  paid_at ? new Date(paid_at) : new Date(),
                  paymentId
                ]
              );
              
              console.log('Updated payment record with Lahza fields for booking:', booking.id);
            }
            
            // Update booking status to confirmed
            await bookingModel.update(booking.id, {
              payment_status: internalStatus,
              status: 'confirmed',
              auto_cancel_at: null
            });
            
            return res.status(200).json({
              status: 'success',
              message: 'Booking created from webhook metadata',
              data: {
                booking_id: booking.id,
                payment_id: payments.length > 0 ? payments[0].id : null,
                status: internalStatus,
                reference: reference
              }
            });
            
          } catch (bookingError) {
            console.error('Error creating booking from webhook metadata:', bookingError);
            
            // Still acknowledge the webhook to prevent retries
            return res.status(200).json({
              status: 'error',
              message: 'Failed to create booking from webhook metadata',
              error: bookingError.message
            });
          }
        }
        
        // If no metadata or payment failed, just acknowledge the webhook
        console.log('No booking metadata found or payment not successful');
        return res.status(200).json({
          status: 'success',
          message: 'Webhook received but no matching payment record or booking metadata found'
        });
      }

      console.log('Found payment record:', payment.id);

      // Update payment data
      const updateData = {
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
        updateData.paid_at = paid_at ? new Date(paid_at) : new Date();
      }

      console.log('Updating payment with data:', updateData);

      // Update payment
      const updatedPayment = await paymentModel.update(payment.id, updateData);

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

// Initialize Lahza payment with booking metadata
paymentController.initializeLahzaPayment = async (req, res) => {
  try {
    const { booking_id } = req.params;
    const { 
      amount, 
      email, 
      first_name, 
      last_name, 
      mobile, 
      callback_url,
      currency = 'SAR'
    } = req.body;

    // Get booking details
    const booking = await bookingModel.getById(booking_id);
    if (!booking) {
      return notFound(res, 'Booking not found');
    }

    // Check if user is authorized to pay for this booking
    if (booking.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Generate unique reference
    const reference = lahzaService.generatePaymentReference(booking_id, req.user.id);

    // Prepare booking metadata for Lahza
    // Extract date and time components from datetime fields
    const startDateTime = new Date(booking.start_datetime);
    const endDateTime = new Date(booking.end_datetime);
    
    const bookingMetadata = {
      booking_id: booking.id,
      user_id: booking.user_id,
      listing_id: booking.listing_id,
      host_id: booking.host_id,
      start_date: startDateTime.toISOString().split('T')[0], // YYYY-MM-DD
      end_date: endDateTime.toISOString().split('T')[0], // YYYY-MM-DD
      start_time: startDateTime.toTimeString().split(' ')[0], // HH:MM:SS
      end_time: endDateTime.toTimeString().split(' ')[0], // HH:MM:SS
      start_datetime: booking.start_datetime,
      end_datetime: booking.end_datetime,
      booking_type: booking.booking_type,
      booking_period: booking.booking_period,
      total_amount: booking.total_price,
      guest_count: booking.guests_count,
      special_requests: booking.special_requests,
      status: booking.status
    };

    // Initialize Lahza payment with metadata
    const lahzaResponse = await lahzaService.initializePayment({
      amount,
      email,
      currency,
      reference,
      callback_url,
      first_name,
      last_name,
      mobile
    }, bookingMetadata);

    // Create payment record
    const paymentData = {
      booking_id: booking.id,
      user_id: req.user.id,
      method: 'card',
      amount: amount,
      deposit_amount: amount,
      remaining_amount: 0,
      status: 'pending',
      payment_deadline: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours
      lahza_reference: reference
    };

    const payment = await paymentModel.create(paymentData);

    res.json({
      success: true,
      payment_id: payment.id,
      lahza_response: lahzaResponse,
      reference: reference
    });

  } catch (error) {
    console.error('Error initializing Lahza payment:', error);
    return serverError(res, 'Failed to initialize payment');
  }
};

module.exports = paymentController;