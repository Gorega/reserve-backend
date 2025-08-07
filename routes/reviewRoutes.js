const express = require('express');
const reviewController = require('../controllers/reviewController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Public routes
router.get('/listing/:listingId', reviewController.getListingReviews);

// Protected routes
router.use(authMiddleware.protect);

// User review routes
router.post('/', reviewController.createReview);
router.get('/my-reviews', reviewController.getUserReviews);
router.get('/user/:userId', reviewController.getUserReviews);
router.patch('/:id', reviewController.updateReview);
router.delete('/:id', reviewController.deleteReview);

// Host response to review
router.post('/:id/respond', reviewController.respondToReview);

module.exports = router; 