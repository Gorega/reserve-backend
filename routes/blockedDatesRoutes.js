const express = require('express');
const blockedDatesController = require('../controllers/blockedDatesController');
const { protect } = require('../middleware/authMiddleware');
const { validate, blockedDatesValidationRules, idParamValidation } = require('../middleware/validationMiddleware');

const router = express.Router();

/**
 * @route   GET /api/blocked-dates/listings/:listingId
 * @desc    Get all blocked dates for a listing
 * @access  Public
 */
router.get('/listings/:listingId', blockedDatesController.getBlockedDates);

// Protected routes
router.use(protect);

/**
 * @route   POST /api/blocked-dates/listings/:listingId
 * @desc    Add a blocked date to a listing
 * @access  Private (listing owner only)
 */
router.post('/listings/:listingId', blockedDatesValidationRules.create, validate, blockedDatesController.addBlockedDate);

/**
 * @route   PUT /api/blocked-dates/:id
 * @desc    Update a blocked date
 * @access  Private (listing owner only)
 */
router.put('/:id', idParamValidation, blockedDatesValidationRules.update, validate, blockedDatesController.updateBlockedDate);

/**
 * @route   DELETE /api/blocked-dates/:id
 * @desc    Delete a blocked date
 * @access  Private (listing owner only)
 */
router.delete('/:id', idParamValidation, validate, blockedDatesController.deleteBlockedDate);

module.exports = router; 