const db = require('../config/database');
const { notFound, badRequest } = require('../utils/errorHandler');

/**
 * Cancellation Policy Model
 * Handles database operations for cancellation policies
 */
const cancellationPolicyModel = {
  /**
   * Get all cancellation policies
   * @returns {Promise<Array>} Array of cancellation policies
   */
  async getAll() {
    try {
      const policies = await db.query('SELECT * FROM cancellation_policies ORDER BY name');
      return policies;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get cancellation policy by ID
   * @param {number} id - Policy ID
   * @returns {Promise<Object>} Cancellation policy
   */
  async getById(id) {
    try {
      const [policy] = await db.query('SELECT * FROM cancellation_policies WHERE id = ?', [id]);
      
      if (!policy) {
        throw notFound('Cancellation policy not found');
      }
      
      return policy;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get cancellation policy by name
   * @param {string} name - Policy name (flexible, moderate, strict, non_refundable)
   * @returns {Promise<Object>} Cancellation policy
   */
  async getByName(name) {
    try {
      const [policy] = await db.query('SELECT * FROM cancellation_policies WHERE name = ?', [name]);
      
      if (!policy) {
        throw notFound('Cancellation policy not found');
      }
      
      return policy;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Create a new cancellation policy
   * @param {Object} policyData - Policy data
   * @returns {Promise<Object>} Created policy
   */
  async create(policyData) {
    try {
      // Check if policy with same name already exists
      const [existingPolicy] = await db.query('SELECT id FROM cancellation_policies WHERE name = ?', [policyData.name]);
      
      if (existingPolicy) {
        throw badRequest(`Cancellation policy with name '${policyData.name}' already exists`);
      }
      
      // Insert policy
      const result = await db.insert('cancellation_policies', policyData);
      
      // Get created policy
      const policy = await this.getById(result.insertId);
      
      return policy;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Update a cancellation policy
   * @param {number} id - Policy ID
   * @param {Object} policyData - Updated policy data
   * @returns {Promise<Object>} Updated policy
   */
  async update(id, policyData) {
    try {
      // Check if policy exists
      await this.getById(id);
      
      // If name is being updated, check for duplicates
      if (policyData.name) {
        const [existingPolicy] = await db.query(
          'SELECT id FROM cancellation_policies WHERE name = ? AND id != ?', 
          [policyData.name, id]
        );
        
        if (existingPolicy) {
          throw badRequest(`Cancellation policy with name '${policyData.name}' already exists`);
        }
      }
      
      // Update policy
      await db.update('cancellation_policies', id, policyData);
      
      // Get updated policy
      const policy = await this.getById(id);
      
      return policy;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Delete a cancellation policy
   * @param {number} id - Policy ID
   * @returns {Promise<void>}
   */
  async delete(id) {
    try {
      // Check if policy exists
      await this.getById(id);
      
      // Check if policy is in use by any listings
      const [listings] = await db.query('SELECT COUNT(*) as count FROM listings WHERE cancellation_policy = (SELECT name FROM cancellation_policies WHERE id = ?)', [id]);
      
      if (listings.count > 0) {
        throw badRequest('Cannot delete cancellation policy that is in use by listings');
      }
      
      // Delete policy
      await db.remove('cancellation_policies', id);
    } catch (error) {
      throw error;
    }
  },

  /**
   * Calculate refund amount based on cancellation policy
   * @param {Object} booking - Booking data
   * @param {Date} cancellationDate - Date of cancellation
   * @returns {Promise<Object>} Refund details
   */
  async calculateRefund(booking, cancellationDate) {
    try {
      // Get listing to find cancellation policy
      const [listing] = await db.query('SELECT cancellation_policy FROM listings WHERE id = ?', [booking.listing_id]);
      
      if (!listing) {
        throw notFound('Listing not found');
      }
      
      // Get cancellation policy details
      const [policy] = await db.query('SELECT * FROM cancellation_policies WHERE name = ?', [listing.cancellation_policy]);
      
      if (!policy) {
        throw notFound('Cancellation policy not found');
      }
      
      // Calculate days before check-in
      const bookingStart = new Date(booking.start_datetime);
      const daysDifference = Math.floor((bookingStart - cancellationDate) / (1000 * 60 * 60 * 24));
      
      // Calculate refund amount
      let refundPercentage = 0;
      
      if (daysDifference >= policy.refund_before_days) {
        // Cancellation is early enough for higher refund percentage
        refundPercentage = policy.refund_before_percentage;
      } else if (daysDifference >= 0) {
        // Cancellation is after the cutoff but before check-in
        refundPercentage = policy.refund_after_percentage;
      } else {
        // Cancellation after check-in (no refund)
        refundPercentage = 0;
      }
      
      const refundAmount = (booking.total_price * refundPercentage) / 100;
      
      return {
        booking_id: booking.id,
        total_price: booking.total_price,
        refund_percentage: refundPercentage,
        refund_amount: refundAmount,
        policy_name: policy.name,
        policy_description: policy.description
      };
    } catch (error) {
      throw error;
    }
  }
};

module.exports = cancellationPolicyModel; 