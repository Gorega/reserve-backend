const express = require('express');
const hostController = require('../controllers/hostController');
const { protect } = require('../middleware/authMiddleware');
const { uploadSingle } = require('../utils/fileUpload');

const router = express.Router();

// All routes require authentication
router.use(protect);

/**
 * @route   GET /api/hosts/profile
 * @desc    Get current user's host profile
 * @access  Private
 */
router.get('/profile', hostController.getProfile);

/**
 * @route   PUT /api/hosts/profile
 * @desc    Update host profile
 * @access  Private
 */
router.put('/profile', hostController.updateProfile);

/**
 * @route   GET /api/hosts/reservations/today
 * @desc    Get today's reservations for host
 * @access  Private
 */
router.get('/reservations/today', hostController.getTodayReservations);

/**
 * @route   GET /api/hosts/reservations/upcoming
 * @desc    Get upcoming reservations for host
 * @access  Private
 */
router.get('/reservations/upcoming', hostController.getUpcomingReservations);

/**
 * @route   GET /api/hosts/listings
 * @desc    Get all listings for the current host
 * @access  Private
 */
router.get('/listings', hostController.getHostListings);

/**
 * @route   POST /api/hosts/listings/:listingId/toggle-status
 * @desc    Toggle active status for a specific listing
 * @access  Private
 */
router.post('/listings/:listingId/toggle-status', hostController.toggleListingStatus);

/**
 * @route   GET /api/hosts/listings/:listingId/reservations
 * @desc    Get reservations for a specific listing
 * @access  Private
 */
router.get('/listings/:listingId/reservations', hostController.getListingReservations);

/**
 * @route   GET /api/hosts/listings/:listingId/blocked-dates
 * @desc    Get blocked dates for a specific listing
 * @access  Private
 */
router.get('/listings/:listingId/blocked-dates', hostController.getListingBlockedDates);

/**
 * @route   POST /api/hosts/listings/:listingId/blocked-dates
 * @desc    Block dates for a specific listing
 * @access  Private
 */
router.post('/listings/:listingId/blocked-dates', hostController.addListingBlockedDates);

/**
 * @route   DELETE /api/hosts/listings/:listingId/blocked-dates/:blockId
 * @desc    Remove blocked dates for a specific listing
 * @access  Private
 */
router.delete('/listings/:listingId/blocked-dates/:blockId', hostController.deleteBlockedDate);

/**
 * @route   GET /api/hosts/listings/:listingId/availability
 * @desc    Get availability mode for a specific listing
 * @access  Private
 */
router.get('/listings/:listingId/availability', hostController.getListingAvailability);

/**
 * @route   PUT /api/hosts/listings/:listingId/availability/mode
 * @desc    Set availability mode (available-by-default or blocked-by-default)
 * @access  Private
 */
router.put('/listings/:listingId/availability/mode', hostController.setAvailabilityMode);

/**
 * @route   GET /api/hosts/listings/:listingId/available-slots
 * @desc    Get available time slots for a specific listing
 * @access  Private
 */
router.get('/listings/:listingId/available-slots', hostController.getListingAvailableSlots);

/**
 * @route   POST /api/hosts/listings/:listingId/available-slots
 * @desc    Add available slots directly to available_slots table
 * @access  Private
 */
router.post('/listings/:listingId/available-slots', hostController.addAvailableSlots);

/**
 * @route   DELETE /api/hosts/listings/:listingId/available-slots/:slotId
 * @desc    Delete available slot from available_slots table
 * @access  Private
 */
router.delete('/listings/:listingId/available-slots/:slotId', hostController.deleteAvailableSlot);

/**
 * @route   POST /api/hosts/listings/:listingId/synchronize-slots
 * @desc    Synchronize available slots for a specific listing
 * @access  Private
 */
router.post('/listings/:listingId/synchronize-slots', hostController.synchronizeListingAvailableSlots);

/**
 * @route   POST /api/hosts/listings/:listingId/initialize-slots
 * @desc    Initialize available slots table and data for a specific listing
 * @access  Private
 */
router.post('/listings/:listingId/initialize-slots', hostController.initializeListingAvailableSlots);

/**
 * @route   GET /api/hosts/qualifications
 * @desc    Get current user's qualifications
 * @access  Private
 */
router.get('/qualifications', hostController.getQualifications);

/**
 * @route   POST /api/hosts/qualifications
 * @desc    Add qualification
 * @access  Private
 */
router.post('/qualifications', hostController.addQualification);

/**
 * @route   PUT /api/hosts/qualifications/:id
 * @desc    Update qualification
 * @access  Private
 */
router.put('/qualifications/:id', hostController.updateQualification);

/**
 * @route   DELETE /api/hosts/qualifications/:id
 * @desc    Delete qualification
 * @access  Private
 */
router.delete('/qualifications/:id', hostController.deleteQualification);

/**
 * @route   GET /api/hosts/portfolio
 * @desc    Get current user's portfolio
 * @access  Private
 */
router.get('/portfolio', hostController.getPortfolio);

/**
 * @route   POST /api/hosts/portfolio
 * @desc    Add portfolio item
 * @access  Private
 */
router.post('/portfolio', uploadSingle('image'), hostController.addPortfolioItem);

/**
 * @route   PUT /api/hosts/portfolio/:id
 * @desc    Update portfolio item
 * @access  Private
 */
router.put('/portfolio/:id', uploadSingle('image'), hostController.updatePortfolioItem);

/**
 * @route   DELETE /api/hosts/portfolio/:id
 * @desc    Delete portfolio item
 * @access  Private
 */
router.delete('/portfolio/:id', hostController.deletePortfolioItem);

/**
 * @route   PUT /api/hosts/portfolio/order
 * @desc    Update portfolio items order
 * @access  Private
 */
router.put('/portfolio/order', hostController.updatePortfolioOrder);

/**
 * @route   GET /api/hosts/:userId
 * @desc    Get host profile by user ID
 * @access  Private
 */
router.get('/:userId', hostController.getProfile);

/**
 * @route   GET /api/hosts/:userId/qualifications
 * @desc    Get host qualifications by user ID
 * @access  Private
 */
router.get('/:userId/qualifications', hostController.getQualifications);

/**
 * @route   GET /api/hosts/:userId/portfolio
 * @desc    Get host portfolio by user ID
 * @access  Private
 */
router.get('/:userId/portfolio', hostController.getPortfolio);

module.exports = router; 