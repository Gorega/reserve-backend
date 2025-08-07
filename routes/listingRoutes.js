const express = require('express');
const listingController = require('../controllers/listingController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { listingValidationRules, validate, idParamValidation } = require('../middleware/validationMiddleware');
const { uploadMultiple } = require('../utils/fileUpload');

const router = express.Router();

/**
 * @route   GET /api/listings
 * @desc    Get all listings with optional filtering
 *          Supports filters: category_id, main_category_id, include_subcategories,
 *          location, min_price, max_price, start_date, end_date, 
 *          is_hourly, active, instant_booking, amenities, etc.
 *          Use 'search' parameter to search in title, location, and description fields.
 * @access  Public
 */
router.get(
  '/',
  listingController.getAll
);

/**
 * @route   GET /api/listings/:id
 * @desc    Get listing by ID
 * @access  Public
 */
router.get(
  '/:id',
  idParamValidation,
  validate,
  listingController.getById
);

/**
 * @route   POST /api/listings
 * @desc    Create a new listing
 * @access  Private/Provider
 */
router.post(
  '/',
  protect,
  restrictTo('provider'),
  uploadMultiple('photos', 10),
  listingValidationRules.create,
  validate,
  listingController.create
);

/**
 * @route   PUT /api/listings/:id
 * @desc    Update a listing
 * @access  Private/Owner
 */
router.put(
  '/:id',
  protect,
  idParamValidation,
  uploadMultiple('photos', 10),
  listingValidationRules.update,
  validate,
  listingController.update
);

/**
 * @route   DELETE /api/listings/:id
 * @desc    Delete a listing
 * @access  Private/Owner
 */
router.delete(
  '/:id',
  protect,
  idParamValidation,
  validate,
  listingController.delete
);

/**
 * @route   POST /api/listings/:id/photos
 * @desc    Add photos to a listing
 * @access  Private/Owner
 */
router.post(
  '/:id/photos',
  protect,
  idParamValidation,
  uploadMultiple('photos', 10),
  validate,
  listingController.addPhotos
);

/**
 * @route   DELETE /api/listings/:id/photos/:photoId
 * @desc    Delete a photo from a listing
 * @access  Private/Owner
 */
router.delete(
  '/:id/photos/:photoId',
  protect,
  idParamValidation,
  validate,
  listingController.deletePhoto
);

/**
 * @route   PUT /api/listings/:id/photos/:photoId/cover
 * @desc    Set a photo as the cover photo
 * @access  Private/Owner
 */
router.put(
  '/:id/photos/:photoId/cover',
  protect,
  idParamValidation,
  validate,
  listingController.setCoverPhoto
);

/**
 * @route   GET/POST /api/listings/:id/check-availability
 * @desc    Check availability for a listing
 * @access  Public
 */
router.get(
  '/:id/check-availability',
  idParamValidation,
  validate,
  listingController.checkAvailability
);

router.post(
  '/:id/check-availability',
  idParamValidation,
  validate,
  listingController.checkAvailability
);

/**
 * @route   POST /api/listings/:id/availability
 * @desc    Add availability to a listing
 * @access  Private/Owner
 */
router.post(
  '/:id/availability',
  protect,
  idParamValidation,
  validate,
  listingController.addAvailability
);

module.exports = router; 