const express = require('express');
const paymentController = require('../controllers/paymentController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Public routes
router.post('/webhook', paymentController.processPayment); // Webhook route (no auth required)
router.get('/webhook', paymentController.processPayment); // Webhook route for GET requests (no auth required)
router.get('/locations', paymentController.getPaymentLocations); // Get payment locations

// Protect all routes after this middleware
router.use(authMiddleware.protect);

// Routes for user payments
router.post('/', paymentController.create);
router.post('/lahza/:booking_id', paymentController.initializeLahzaPayment);
router.get('/my-payments', paymentController.getUserPayments);
router.get('/host-payments', paymentController.getHostPayments);
router.get('/:id', paymentController.getById);

// Admin only routes
router.use(authMiddleware.restrictTo('admin'));
router.get('/', paymentController.getAll);
router.patch('/:id/status', paymentController.updateStatus);

module.exports = router;