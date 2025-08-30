const pricingOptionModel = require('../models/pricingOptionModel');
const listingModel = require('../models/listingModel');
const { serverError, notFound, badRequest } = require('../utils/errorHandler');

/**
 * Pricing Option Controller
 * Handles HTTP requests for pricing option operations
 */
const pricingOptionController = {
  /**
   * Get all pricing options for a listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getByListingId(req, res, next) {
    try {
      const { listingId } = req.params;
      
      // Verify listing exists
      const listing = await listingModel.getById(listingId);
      
      const options = await pricingOptionModel.getByListingId(listingId);
      
      res.status(200).json({
        status: 'success',
        results: options.length,
        data: options
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Create a new pricing option
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async create(req, res, next) {
    try {
      const { listingId } = req.params;
      const optionData = req.body;
      
      // Verify listing exists
      const listing = await listingModel.getById(listingId);
      
      // Check if user owns the listing
      if (listing.user_id !== req.user.id && !req.user.is_admin) {
        return next(badRequest('You do not own this listing'));
      }
      
      // Set listing ID
      optionData.listing_id = listingId;
      
      // Create pricing option
      const option = await pricingOptionModel.create(optionData);
      
      res.status(201).json({
        status: 'success',
        data: option
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Update a pricing option
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async update(req, res, next) {
    try {
      const { listingId, optionId } = req.params;
      const optionData = req.body;
      
      // Verify listing exists
      const listing = await listingModel.getById(listingId);
      
      // Check if user owns the listing
      if (listing.user_id !== req.user.id && !req.user.is_admin) {
        return next(badRequest('You do not own this listing'));
      }
      
      // Verify option exists and belongs to the listing
      const option = await pricingOptionModel.getById(optionId);
      if (option.listing_id != listingId) {
        return next(badRequest('Pricing option does not belong to this listing'));
      }
      
      // Update pricing option
      const updatedOption = await pricingOptionModel.update(optionId, optionData);
      
      res.status(200).json({
        status: 'success',
        data: updatedOption
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Delete a pricing option
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async delete(req, res, next) {
    try {
      const { listingId, optionId } = req.params;
      
      // Verify listing exists
      const listing = await listingModel.getById(listingId);
      
      // Check if user owns the listing
      if (listing.user_id !== req.user.id && !req.user.is_admin) {
        return next(badRequest('You do not own this listing'));
      }
      
      // Verify option exists and belongs to the listing
      const option = await pricingOptionModel.getById(optionId);
      if (option.listing_id != listingId) {
        return next(badRequest('Pricing option does not belong to this listing'));
      }
      
      // Check if this is the only pricing option
      const options = await pricingOptionModel.getByListingId(listingId);
      if (options.length <= 1) {
        return next(badRequest('Cannot delete the only pricing option for a listing'));
      }
      
      // Delete pricing option
      await pricingOptionModel.delete(optionId);
      
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Set a pricing option as default
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async setDefault(req, res, next) {
    try {
      const { listingId, optionId } = req.params;
      
      // Verify listing exists
      const listing = await listingModel.getById(listingId);
      
      // Check if user owns the listing
      if (listing.user_id !== req.user.id && !req.user.is_admin) {
        return next(badRequest('You do not own this listing'));
      }
      
      // Verify option exists and belongs to the listing
      const option = await pricingOptionModel.getById(optionId);
      if (option.listing_id != listingId) {
        return next(badRequest('Pricing option does not belong to this listing'));
      }
      
      // Update pricing option to be default
      const updatedOption = await pricingOptionModel.update(optionId, { is_default: true });
      
      res.status(200).json({
        status: 'success',
        data: updatedOption
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Create or update multiple pricing options for a listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updateAll(req, res, next) {
    try {
      const { listingId } = req.params;
      const { options } = req.body;
      
      if (!Array.isArray(options) || options.length === 0) {
        return next(badRequest('At least one pricing option is required'));
      }
      
      // Verify listing exists
      const listing = await listingModel.getById(listingId);
      
      // Check if user owns the listing
      if (listing.user_id !== req.user.id && !req.user.is_admin) {
        return next(badRequest('You do not own this listing'));
      }
      
      // Create/update pricing options
      const updatedOptions = await pricingOptionModel.createMultiple(listingId, options);
      
      res.status(200).json({
        status: 'success',
        results: updatedOptions.length,
        data: updatedOptions
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = pricingOptionController;






