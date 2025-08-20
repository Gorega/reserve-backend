const express = require('express');
const specialPricingController = require('../controllers/specialPricingController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Get all special pricing for a listing
router.get('/listing/:listingId', specialPricingController.getByListingId);

// Get special pricing for a specific date
router.get('/listing/:listingId/date/:date', specialPricingController.getByDate);

// Get effective price for a specific date (includes fallback to regular pricing)
router.get('/listing/:listingId/date/:date/effective-price', specialPricingController.getEffectivePrice);

// Create special pricing (requires authentication)
router.post('/listing/:listingId', protect, specialPricingController.create);

// Create special pricing for date range (requires authentication)
router.post('/listing/:listingId/date-range', protect, specialPricingController.createForDateRange);

// Update special pricing (requires authentication)
router.put('/listing/:listingId/special-pricing/:specialPricingId', protect, specialPricingController.update);

// Delete special pricing (requires authentication)
router.delete('/listing/:listingId/special-pricing/:specialPricingId', protect, specialPricingController.delete);

// Delete special pricing for date range (requires authentication)
router.delete('/listing/:listingId/date-range', protect, specialPricingController.deleteForDateRange);

module.exports = router;