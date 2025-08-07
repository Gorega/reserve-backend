const cancellationPolicyModel = require('../models/cancellationPolicyModel');
const { errorHandler } = require('../utils/errorHandler');

/**
 * Cancellation Policy Controller
 * Handles HTTP requests for cancellation policies
 */
const cancellationPolicyController = {
  /**
   * Get all cancellation policies
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getAllPolicies(req, res, next) {
    try {
      const policies = await cancellationPolicyModel.getAll();
      
      res.status(200).json({
        status: 'success',
        results: policies.length,
        data: policies
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Get cancellation policy by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getPolicyById(req, res, next) {
    try {
      const { id } = req.params;
      const policy = await cancellationPolicyModel.getById(id);
      
      res.status(200).json({
        status: 'success',
        data: policy
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Get cancellation policy by name
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getPolicyByName(req, res, next) {
    try {
      const { name } = req.params;
      const policy = await cancellationPolicyModel.getByName(name);
      
      res.status(200).json({
        status: 'success',
        data: policy
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Create a new cancellation policy
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async createPolicy(req, res, next) {
    try {
      const policyData = {
        name: req.body.name,
        description: req.body.description,
        refund_before_days: req.body.refund_before_days,
        refund_before_percentage: req.body.refund_before_percentage,
        refund_after_percentage: req.body.refund_after_percentage
      };
      
      const policy = await cancellationPolicyModel.create(policyData);
      
      res.status(201).json({
        status: 'success',
        data: policy
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Update a cancellation policy
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updatePolicy(req, res, next) {
    try {
      const { id } = req.params;
      const policyData = {};
      
      // Only include fields that are provided
      if (req.body.name !== undefined) policyData.name = req.body.name;
      if (req.body.description !== undefined) policyData.description = req.body.description;
      if (req.body.refund_before_days !== undefined) policyData.refund_before_days = req.body.refund_before_days;
      if (req.body.refund_before_percentage !== undefined) policyData.refund_before_percentage = req.body.refund_before_percentage;
      if (req.body.refund_after_percentage !== undefined) policyData.refund_after_percentage = req.body.refund_after_percentage;
      
      const policy = await cancellationPolicyModel.update(id, policyData);
      
      res.status(200).json({
        status: 'success',
        data: policy
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Delete a cancellation policy
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async deletePolicy(req, res, next) {
    try {
      const { id } = req.params;
      await cancellationPolicyModel.delete(id);
      
      res.status(204).end();
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Calculate refund amount for a booking cancellation
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async calculateRefund(req, res, next) {
    try {
      const { bookingId } = req.params;
      const cancellationDate = req.body.cancellation_date ? new Date(req.body.cancellation_date) : new Date();
      
      // Get booking
      const db = require('../config/database');
      const [booking] = await db.query('SELECT * FROM bookings WHERE id = ?', [bookingId]);
      
      if (!booking) {
        return res.status(404).json({
          status: 'error',
          message: 'Booking not found'
        });
      }
      
      // Check if user is authorized (either the booking user or the listing owner)
      const [listing] = await db.query('SELECT user_id FROM listings WHERE id = ?', [booking.listing_id]);
      
      if (booking.user_id !== req.user.id && listing.user_id !== req.user.id) {
        return res.status(403).json({
          status: 'error',
          message: 'You are not authorized to access this booking'
        });
      }
      
      // Calculate refund
      const refundDetails = await cancellationPolicyModel.calculateRefund(booking, cancellationDate);
      
      res.status(200).json({
        status: 'success',
        data: refundDetails
      });
    } catch (error) {
      next(errorHandler(error));
    }
  }
};

module.exports = cancellationPolicyController; 