const express = require('express');
const listingFeaturesController = require('../controllers/listingFeaturesController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const router = express.Router();

// Public routes
router.get('/amenities', listingFeaturesController.getAllAmenities);
router.get('/amenities/:id', listingFeaturesController.getAmenityById);
router.get('/house-rules', listingFeaturesController.getAllHouseRules);
router.get('/house-rules/:id', listingFeaturesController.getHouseRuleById);
router.get('/safety-features', listingFeaturesController.getAllSafetyFeatures);
router.get('/safety-features/:id', listingFeaturesController.getSafetyFeatureById);
router.get('/cancellation-policies', listingFeaturesController.getAllCancellationPolicies);
router.get('/cancellation-policies/:name', listingFeaturesController.getCancellationPolicyByName);

// Admin only routes
router.use(protect);
router.use(restrictTo('admin'));

// Amenities admin routes
router.post('/amenities', listingFeaturesController.createAmenity);
router.put('/amenities/:id', listingFeaturesController.updateAmenity);
router.delete('/amenities/:id', listingFeaturesController.deleteAmenity);

// House rules admin routes
router.post('/house-rules', listingFeaturesController.createHouseRule);
router.put('/house-rules/:id', listingFeaturesController.updateHouseRule);
router.delete('/house-rules/:id', listingFeaturesController.deleteHouseRule);

// Safety features admin routes
router.post('/safety-features', listingFeaturesController.createSafetyFeature);
router.put('/safety-features/:id', listingFeaturesController.updateSafetyFeature);
router.delete('/safety-features/:id', listingFeaturesController.deleteSafetyFeature);

// Cancellation policies admin routes
router.put('/cancellation-policies/:name', listingFeaturesController.updateCancellationPolicy);

module.exports = router; 