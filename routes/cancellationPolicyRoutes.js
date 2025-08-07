const express = require('express');
const cancellationPolicyController = require('../controllers/cancellationPolicyController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { validate, idParamValidation, cancellationPolicyValidationRules } = require('../middleware/validationMiddleware');

const router = express.Router();

/**
 * @route   GET /api/cancellation-policies
 * @desc    Get all cancellation policies
 * @access  Public
 */
router.get('/', cancellationPolicyController.getAllPolicies);

/**
 * @route   GET /api/cancellation-policies/:id
 * @desc    Get cancellation policy by ID
 * @access  Public
 */
router.get('/:id', idParamValidation, validate, cancellationPolicyController.getPolicyById);

/**
 * @route   GET /api/cancellation-policies/name/:name
 * @desc    Get cancellation policy by name
 * @access  Public
 */
router.get('/name/:name', cancellationPolicyController.getPolicyByName);

// Protected routes
router.use(protect);

/**
 * @route   POST /api/cancellation-policies/calculate/:bookingId
 * @desc    Calculate refund amount for a booking
 * @access  Private (booking user or listing owner only)
 */
router.post('/calculate/:bookingId', cancellationPolicyValidationRules.calculate, validate, cancellationPolicyController.calculateRefund);

// Admin only routes
router.use(restrictTo('admin'));

/**
 * @route   POST /api/cancellation-policies
 * @desc    Create a new cancellation policy
 * @access  Private (admin only)
 */
router.post('/', cancellationPolicyValidationRules.create, validate, cancellationPolicyController.createPolicy);

/**
 * @route   PUT /api/cancellation-policies/:id
 * @desc    Update a cancellation policy
 * @access  Private (admin only)
 */
router.put('/:id', idParamValidation, cancellationPolicyValidationRules.update, validate, cancellationPolicyController.updatePolicy);

/**
 * @route   DELETE /api/cancellation-policies/:id
 * @desc    Delete a cancellation policy
 * @access  Private (admin only)
 */
router.delete('/:id', idParamValidation, validate, cancellationPolicyController.deletePolicy);

module.exports = router; 