const categoryModel = require('../models/categoryModel');
const { notFound, badRequest } = require('../utils/errorHandler');

/**
 * Category Controller
 * Handles HTTP requests for category operations
 */
const categoryController = {
  /**
   * Get all categories
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getAll(req, res, next) {
    try {
      const { structured } = req.query;
      let categories;
      
      if (structured === 'true') {
        // Get categories in a structured format (main categories with subcategories)
        const mainCategories = await categoryModel.getMainCategories();
        
        // For each main category, get its subcategories
        for (const category of mainCategories) {
          category.subcategories = await categoryModel.getSubcategories(category.id);
        }
        
        // Sort main categories to ensure the primary 4 categories are first
        // (Property, Vehicle, Service, Subscription)
        const primaryCategoryNames = ['Property', 'Vehicle', 'Service'];
        mainCategories.sort((a, b) => {
          const aIndex = primaryCategoryNames.indexOf(a.name);
          const bIndex = primaryCategoryNames.indexOf(b.name);
          
          // If both are primary categories, sort by the predefined order
          if (aIndex !== -1 && bIndex !== -1) {
            return aIndex - bIndex;
          }
          
          // If only a is a primary category, it comes first
          if (aIndex !== -1) return -1;
          
          // If only b is a primary category, it comes first
          if (bIndex !== -1) return 1;
          
          // If neither is a primary category, maintain original order
          return a.id - b.id;
        });
        
        categories = mainCategories;
      } else {
        // Get all categories in a flat list
        categories = await categoryModel.getAll();
      }
      
      res.status(200).json({
        status: 'success',
        results: categories.length,
        data: categories
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Get category by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const { include_subcategories } = req.query;
      
      const category = await categoryModel.getById(id);
      
      // If requested, include subcategories
      if (include_subcategories === 'true' && category.parent_id === null) {
        category.subcategories = await categoryModel.getSubcategories(id);
      }
      
      res.status(200).json({
        status: 'success',
        data: category
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Create a new category
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async create(req, res, next) {
    try {
      const categoryData = req.body;
      
      // Validate parent_id if provided
      if (categoryData.parent_id) {
        try {
          await categoryModel.getById(categoryData.parent_id);
        } catch (error) {
          return next(badRequest('Invalid parent category ID'));
        }
      }
      
      const category = await categoryModel.create(categoryData);
      
      res.status(201).json({
        status: 'success',
        data: category
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Update a category
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const categoryData = req.body;
      
      // Validate parent_id if provided
      if (categoryData.parent_id) {
        // Prevent circular references
        if (categoryData.parent_id === parseInt(id)) {
          return next(badRequest('Category cannot be its own parent'));
        }
        
        try {
          await categoryModel.getById(categoryData.parent_id);
        } catch (error) {
          return next(badRequest('Invalid parent category ID'));
        }
      }
      
      const category = await categoryModel.update(id, categoryData);
      
      res.status(200).json({
        status: 'success',
        data: category
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Delete a category
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async delete(req, res, next) {
    try {
      const { id } = req.params;
      await categoryModel.delete(id);
      
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Get listings by category
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getListings(req, res, next) {
    try {
      const { id } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const includeSubcategories = req.query.include_subcategories === 'true';
      
      // Create filters object for additional filtering
      const filters = {};
      
      // Add date filters if provided
      if (req.query.start_date) filters.start_date = req.query.start_date;
      if (req.query.end_date) filters.end_date = req.query.end_date;
      
      // Add location filter if provided
      if (req.query.location) filters.location = req.query.location;

      // Add combined search filter if provided
      if (req.query.search) filters.search = req.query.search;
      
      const listings = await categoryModel.getListings(id, page, limit, includeSubcategories, filters);
      
      res.status(200).json({
        status: 'success',
        results: listings.length,
        data: listings
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = categoryController; 