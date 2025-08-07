const express = require('express');
const paymentController = require('../controllers/paymentController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Public routes
router.get('/', paymentController.getPaymentLocations);

// Admin only routes
router.use(authMiddleware.protect);
router.use(authMiddleware.restrictTo('admin'));

// These would be implemented in a payment location controller
// router.post('/', paymentLocationController.create);
// router.put('/:id', paymentLocationController.update);
// router.delete('/:id', paymentLocationController.delete);

module.exports = router; 