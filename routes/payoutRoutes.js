const express = require('express');
const payoutController = require('../controllers/payoutController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// All payout routes require authentication
router.use(authMiddleware.protect);

// Host payout routes
router.post('/', payoutController.requestPayout);
router.get('/my-payouts', payoutController.getHostPayouts);
router.get('/:id', payoutController.getPayout);

// Admin only routes
router.use(authMiddleware.restrictTo('admin'));
router.get('/', payoutController.getAllPayouts);
router.patch('/:id/status', payoutController.updatePayoutStatus);

module.exports = router; 