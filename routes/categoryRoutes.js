const express = require('express');
const router = express.Router();
const listingController = require('../controllers/listingController');
const categoryController = require('../controllers/categoryController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { idParamValidation, validate } = require('../middleware/validationMiddleware');

// Public routes
router.get('/', categoryController.getAll);
router.get('/main', listingController.getMainCategories);
router.get('/sub/:parentId', listingController.getSubcategories);
router.get('/:id', idParamValidation, validate, categoryController.getById);
/**
 * @route   GET /api/categories/:id/listings
 * @desc    Get listings by category with optional filters
 *          Supports filters: include_subcategories, start_date, end_date, location
 *          Use 'search' parameter to search in title, location, and description fields.
 * @access  Public
 */
router.get('/:id/listings', idParamValidation, validate, categoryController.getListings);

// Protected routes
router.post('/', protect, restrictTo('admin'), categoryController.create);
router.put('/:id', protect, restrictTo('admin'), idParamValidation, validate, categoryController.update);
router.delete('/:id', protect, restrictTo('admin'), idParamValidation, validate, categoryController.delete);

module.exports = router; 