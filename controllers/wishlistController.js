const db = require('../config/database');
const { errorHandler } = require('../utils/errorHandler');

// Add listing to wishlist
exports.addToWishlist = async (req, res, next) => {
  try {
    const { listingId } = req.body;

    // Check if listing exists
    const listing = await db.getById('listings', listingId);
    if (!listing) {
      return res.status(404).json({
        status: 'error',
        message: 'Listing not found'
      });
    }

    // Check if already in wishlist
    const [existingWishlist] = await db.query(
      'SELECT * FROM wishlists WHERE user_id = ? AND listing_id = ?',
      [req.user.id, listingId]
    );

    if (existingWishlist) {
      return res.status(400).json({
        status: 'error',
        message: 'Listing is already in your wishlist'
      });
    }

    // Add to wishlist
    const wishlistData = {
      user_id: req.user.id,
      listing_id: listingId
    };

    await db.insert('wishlists', wishlistData);

    res.status(201).json({
      status: 'success',
      message: 'Listing added to wishlist'
    });
  } catch (error) {
    next(errorHandler(error));
  }
};

// Get user's wishlist
exports.getUserWishlist = async (req, res, next) => {
  try {
    const wishlistItems = await db.query(`
      SELECT w.*, l.title, l.description, l.price_per_hour, l.price_per_day,l.unit_type,
             l.location, l.latitude, l.longitude, l.rating, l.review_count,
             (
               SELECT lp.image_url
               FROM listing_photos lp
               WHERE lp.listing_id = l.id AND lp.is_cover = 1
               LIMIT 1
             ) as cover_image
      FROM wishlists w
      JOIN listings l ON w.listing_id = l.id
      WHERE w.user_id = ?
      ORDER BY w.created_at DESC
    `, [req.user.id]);

    res.status(200).json({
      status: 'success',
      results: wishlistItems.length,
      data: {
        wishlist: wishlistItems
      }
    });
  } catch (error) {
    next(errorHandler(error));
  }
};

// Remove listing from wishlist
exports.removeFromWishlist = async (req, res, next) => {
  try {
    const { listingId } = req.params;

    // Check if in wishlist
    const [existingWishlist] = await db.query(
      'SELECT * FROM wishlists WHERE user_id = ? AND listing_id = ?',
      [req.user.id, listingId]
    );

    if (!existingWishlist) {
      return res.status(404).json({
        status: 'error',
        message: 'Listing not found in your wishlist'
      });
    }

    // Remove from wishlist
    await db.query(
      'DELETE FROM wishlists WHERE user_id = ? AND listing_id = ?',
      [req.user.id, listingId]
    );

    res.status(200).json({
      status: 'success',
      message: 'Listing removed from wishlist'
    });
  } catch (error) {
    next(errorHandler(error));
  }
};

// Check if a listing is in user's wishlist
exports.checkWishlist = async (req, res, next) => {
  try {
    const { listingId } = req.params;

    const [result] = await db.query(
      'SELECT EXISTS(SELECT 1 FROM wishlists WHERE user_id = ? AND listing_id = ?) as is_wishlisted',
      [req.user.id, listingId]
    );

    res.status(200).json({
      status: 'success',
      data: {
        isWishlisted: !!result.is_wishlisted
      }
    });
  } catch (error) {
    next(errorHandler(error));
  }
}; 