const express = require('express');
const bookingController = require('../controllers/bookingController');
const { protect } = require('../middleware/authMiddleware');
const { bookingValidationRules, validate, idParamValidation } = require('../middleware/validationMiddleware');

const router = express.Router();

/**
 * @route   GET /api/bookings
 * @desc    Get all bookings for the authenticated user
 * @access  Private
 */
router.get(
  '/',
  protect,
  bookingController.getAll
);

/**
 * @route   GET /api/bookings/:id
 * @desc    Get booking by ID
 * @access  Private
 */
router.get(
  '/:id',
  protect,
  idParamValidation,
  validate,
  bookingController.getById
);

/**
 * @route   POST /api/bookings
 * @desc    Create a new booking
 * @access  Private
 */
router.post(
  '/',
  protect,
  bookingValidationRules.create,
  validate,
  bookingController.create
);

/**
 * @route   PUT /api/bookings/:id
 * @desc    Update a booking
 * @access  Private
 */
router.put(
  '/:id',
  protect,
  idParamValidation,
  bookingValidationRules.update,
  validate,
  bookingController.update
);

/**
 * @route   POST /api/bookings/:id/cancel
 * @desc    Cancel a booking
 * @access  Private
 */
router.post(
  '/:id/cancel',
  protect,
  idParamValidation,
  validate,
  bookingController.cancel
);

/**
 * @route   POST /api/bookings/:id/complete
 * @desc    Complete a booking
 * @access  Private/Provider
 */
router.post(
  '/:id/complete',
  protect,
  idParamValidation,
  validate,
  bookingController.complete
);

/**
 * @route   POST /api/bookings/:id/payment
 * @desc    Process payment for a booking
 * @access  Private
 */
router.post(
  '/:id/payment',
  protect,
  idParamValidation,
  validate,
  bookingController.processPayment
);

module.exports = router; 