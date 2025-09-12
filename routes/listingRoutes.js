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
 * @route   GET /api/listings/:id/effective-price
 * @desc    Get effective price for a listing on a specific date
 * @access  Public
 * @query   date (required), pricing_option_id (optional)
 */
router.get(
  '/:id/effective-price',
  idParamValidation,
  validate,
  listingController.getEffectivePrice
);

/**
 * @route   POST /api/listings
 * @desc    Create a new listing
 * @access  Private/Provider
 * @body    {
 *            title: string,
 *            description: string,
 *            location: string,
 *            latitude: number,
 *            longitude: number,
 *            pricing_options: [{
 *              id: string,
 *              price: number,
 *              unit_type: 'hour'|'day'|'night',
 *              duration: number
 *            }],
 *            unit_type: 'hour'|'day'|'night',
 *            ... other fields
 *          }
 * @note    The pricing_options field allows defining multiple pricing options with different unit types and durations.
 *          For backward compatibility, the API still accepts price_per_hour, price_per_day, and price_per_half_night fields.
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
 * @body    {
 *            title: string,
 *            description: string,
 *            location: string,
 *            latitude: number,
 *            longitude: number,
 *            pricing_options: [{
 *              id: string,
 *              price: number,
 *              unit_type: 'hour'|'day'|'night',
 *              duration: number
 *            }],
 *            unit_type: 'hour'|'day'|'night',
 *            ... other fields
 *          }
 * @note    The pricing_options field allows defining multiple pricing options with different unit types and durations.
 *          For backward compatibility, the API still accepts price_per_hour, price_per_day, and price_per_half_night fields.
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
 * @route   GET /api/listings/:id/availability
 * @desc    Get availability for a listing on a specific date
 * @access  Public
 * @query   date (required) - Date in YYYY-MM-DD format
 */
router.get(
  '/:id/availability',
  idParamValidation,
  validate,
  listingController.getAvailability
);

/**
 * @route   GET /api/listings/:id/guest-availability
 * @desc    Get comprehensive availability data for guest reservation screens
 *          Returns available dates/times, booked dates, and blocked dates
 * @access  Public
 */
router.get(
  '/:id/guest-availability',
  idParamValidation,
  validate,
  require('../controllers/blockedDatesController').getGuestAvailability
);

/**
 * @route   GET /api/listings/:id/bookings
 * @desc    Get booking data for a specific listing (for availability checking)
 * @access  Public
 */
router.get(
  '/:id/bookings',
  idParamValidation,
  validate,
  require('../controllers/bookingController').getListingBookings
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

/**
 * @route   GET /api/listings/:id/available-slots
 * @desc    Get available time slots for a listing (using same logic as host calendar)
 * @access  Public
 * @query   start_date (required), end_date (required) - Dates in YYYY-MM-DD format
 */
router.get(
  '/:id/available-slots',
  idParamValidation,
  validate,
  listingController.getPublicAvailableSlots
);

/**
 * @route   GET /api/listings/:id/appointment-slots-test
 * @desc    Test endpoint for appointment slots (no validation)
 * @access  Public
 */
router.get('/:id/appointment-slots-test', (req, res) => {
  console.log('🧪 Test endpoint accessed:', req.params, req.query);
  res.json({
    status: 'success',
    message: 'Test endpoint working',
    params: req.params,
    query: req.query
  });
});

/**
 * @route   GET /api/listings/:id/appointment-slots
 * @desc    Get appointment slots for a listing on a specific date
 * @access  Public
 * @query   date (required) - Date in YYYY-MM-DD format
 */
router.get(
  '/:id/appointment-slots',
  idParamValidation,
  validate,
  listingController.getAppointmentSlots
);

/**
 * @route   GET /api/listings/:id/reservations
 * @desc    Get reservations for a listing (for calendar display)
 * @access  Public
 * @query   start_date (optional), end_date (optional) - Dates in YYYY-MM-DD format
 */
router.get(
  '/:id/reservations',
  idParamValidation,
  validate,
  listingController.getPublicReservations
);

/**
 * @route   GET /api/listings/:id/blocked-dates
 * @desc    Get blocked dates for a listing
 * @access  Public
 * @query   start_date (optional), end_date (optional) - Dates in YYYY-MM-DD format
 */
router.get(
  '/:id/blocked-dates',
  idParamValidation,
  validate,
  listingController.getPublicBlockedDates
);

/**
 * @route   GET /api/listings/:id/availability-mode
 * @desc    Get availability mode for a listing
 * @access  Public
 */
router.get(
  '/:id/availability-mode',
  idParamValidation,
  validate,
  listingController.getPublicAvailabilityMode
);

/**
 * @route   POST /api/listings/:id/calculate-pricing
 * @desc    Calculate smart pricing for a listing
 * @access  Public
 */
router.post(
  '/:id/calculate-pricing',
  idParamValidation,
  validate,
  listingController.calculateSmartPricing
);

module.exports = router;