const express = require('express');
const router = express.Router({ mergeParams: true });
const pricingOptionController = require('../controllers/pricingOptionController');
const authMiddleware = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authMiddleware.protect);

// Get all pricing options for a listing
router.get('/', pricingOptionController.getByListingId);

// Create a new pricing option
router.post('/', pricingOptionController.create);

// Update all pricing options for a listing
router.put('/', pricingOptionController.updateAll);

// Update a pricing option
router.put('/:optionId', pricingOptionController.update);

// Delete a pricing option
router.delete('/:optionId', pricingOptionController.delete);

// Set a pricing option as default
router.patch('/:optionId/set-default', pricingOptionController.setDefault);

module.exports = router;



