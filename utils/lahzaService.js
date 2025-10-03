const axios = require('axios');

/**
 * Lahza Payment Service
 * Handles integration with Lahza payment gateway
 */
class LahzaService {
  constructor() {
    this.baseURL = process.env.LAHZA_API_URL || 'https://api.lahza.io';
    this.secretKey = process.env.LAHZA_SECRET_KEY;
    
    if (!this.secretKey) {
      console.warn('LAHZA_SECRET_KEY not configured');
    }
  }

  /**
   * Initialize a payment transaction with booking metadata
   * @param {Object} paymentData - Payment data
   * @param {Object} bookingData - Booking data to include in metadata
   * @returns {Promise<Object>} - Lahza payment response
   */
  async initializePayment(paymentData, bookingData = null) {
    try {
      const {
        amount,
        email,
        currency = 'ILS',
        reference,
        callback_url,
        first_name,
        last_name,
        mobile
      } = paymentData;

      // Prepare metadata with booking information
      let metadata = {};
      if (bookingData) {
        metadata.booking_data = bookingData;
        metadata.created_via = 'webhook_fallback';
        metadata.timestamp = new Date().toISOString();
      }

      const requestData = {
        amount: amount.toString(),
        email,
        currency,
        reference,
        callback_url,
        metadata: JSON.stringify(metadata),
        first_name,
        last_name,
        mobile
      };

      const response = await axios.post(
        `${this.baseURL}/transaction/initialize`,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error initializing Lahza payment:', error.response?.data || error.message);
      throw new Error(`Failed to initialize payment: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Verify a payment transaction
   * @param {string} reference - Transaction reference
   * @returns {Promise<Object>} - Payment verification response
   */
  async verifyPayment(reference) {
    try {
      const response = await axios.get(
        `${this.baseURL}/transaction/verify/${reference}`,
        {
          headers: {
            'Authorization': `Bearer ${this.secretKey}`
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error verifying Lahza payment:', error.response?.data || error.message);
      throw new Error(`Failed to verify payment: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Create a payment page with booking metadata
   * @param {Object} pageData - Payment page data
   * @param {Object} bookingData - Booking data to include in metadata
   * @returns {Promise<Object>} - Lahza page response
   */
  async createPaymentPage(pageData, bookingData = null) {
    try {
      const {
        name,
        description,
        amount,
        currency = 'SAR',
        redirect_url,
        slug
      } = pageData;

      // Prepare metadata with booking information
      let metadata = {};
      if (bookingData) {
        metadata.booking_data = bookingData;
        metadata.created_via = 'webhook_fallback';
        metadata.timestamp = new Date().toISOString();
      }

      const requestData = {
        name,
        description,
        amount: amount ? amount.toString() : null,
        currency,
        redirect_url,
        slug,
        metadata
      };

      const response = await axios.post(
        `${this.baseURL}/page`,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error creating Lahza payment page:', error.response?.data || error.message);
      throw new Error(`Failed to create payment page: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Generate a unique reference for a booking payment
   * @param {number} bookingId - Booking ID
   * @param {string} userId - User ID
   * @returns {string} - Unique reference
   */
  generatePaymentReference(bookingId, userId) {
    const timestamp = Date.now();
    return `booking_${bookingId}_${userId}_${timestamp}`;
  }
}

module.exports = new LahzaService();