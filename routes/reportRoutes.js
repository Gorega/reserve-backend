const express = require('express');
const reportController = require('../controllers/reportController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const router = express.Router();

// All routes require authentication
router.use(protect);

/**
 * @route   POST /api/reports/listings/:listingId
 * @desc    Report a listing
 * @access  Private
 */
router.post('/listings/:listingId', reportController.reportListing);

// Admin only routes
router.use(restrictTo('admin'));

/**
 * @route   GET /api/reports
 * @desc    Get all reports
 * @access  Private/Admin
 */
router.get('/', reportController.getAllReports);

/**
 * @route   GET /api/reports/:id
 * @desc    Get report by ID
 * @access  Private/Admin
 */
router.get('/:id', reportController.getReportById);

/**
 * @route   PATCH /api/reports/:id/status
 * @desc    Update report status
 * @access  Private/Admin
 */
router.patch('/:id/status', reportController.updateReportStatus);

module.exports = router; 