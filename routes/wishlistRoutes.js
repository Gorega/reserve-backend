const express = require('express');
const wishlistController = require('../controllers/wishlistController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// All wishlist routes require authentication
router.use(authMiddleware.protect);

// Wishlist routes
router.post('/', wishlistController.addToWishlist);
router.get('/', wishlistController.getUserWishlist);
router.delete('/:listingId', wishlistController.removeFromWishlist);
router.get('/check/:listingId', wishlistController.checkWishlist);

module.exports = router; 