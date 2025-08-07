const db = require('../config/database');
const { errorHandler } = require('../utils/errorHandler');

// Create a new review
exports.createReview = async (req, res, next) => {
  try {
    const { listingId, rating, comment } = req.body;

    // Check if listing exists
    const listing = await db.getById('listings', listingId);
    if (!listing) {
      return res.status(404).json({
        status: 'error',
        message: 'Listing not found'
      });
    }

    // Check if user already reviewed this listing
    const [existingReview] = await db.query(
      'SELECT * FROM reviews WHERE listing_id = ? AND reviewer_id = ?',
      [listingId, req.user.id]
    );

    if (existingReview) {
      return res.status(400).json({
        status: 'error',
        message: 'You have already reviewed this listing'
      });
    }

    // Create review
    const reviewData = {
      listing_id: listingId,
      reviewer_id: req.user.id,
      rating,
      comment
    };

    const result = await db.insert('reviews', reviewData);
    
    // Get the created review
    const review = await db.getById('reviews', result.insertId);
    
    // Calculate average rating for the listing
    const [ratingData] = await db.query(
      `SELECT AVG(rating) as avg_rating, COUNT(id) as review_count
       FROM reviews
       WHERE listing_id = ?`,
      [listingId]
    );

    // Update listing with new rating data
    await db.query(
      `UPDATE listings SET 
       rating = ?, 
       review_count = ? 
       WHERE id = ?`,
      [ratingData.avg_rating || 0, ratingData.review_count || 0, listingId]
    );

    res.status(201).json({
      status: 'success',
      data: {
        review
      }
    });
  } catch (error) {
    next(errorHandler(error));
  }
};

// Get all reviews for a listing
exports.getListingReviews = async (req, res, next) => {
  try {
    const { listingId } = req.params;
    
    const reviews = await db.query(
      `SELECT r.*, u.name, u.profile_image 
       FROM reviews r
       JOIN users u ON r.reviewer_id = u.id
       WHERE r.listing_id = ?
       ORDER BY r.created_at DESC`,
      [listingId]
    );

    res.status(200).json({
      status: 'success',
      results: reviews.length,
      data: {
        reviews
      }
    });
  } catch (error) {
    next(errorHandler(error));
  }
};

// Get all reviews by a user
exports.getUserReviews = async (req, res, next) => {
  try {
    const userId = req.params.userId || req.user.id;
    
    const reviews = await db.query(
      `SELECT r.*, l.title, l.location
       FROM reviews r
       JOIN listings l ON r.listing_id = l.id
       WHERE r.reviewer_id = ?
       ORDER BY r.created_at DESC`,
      [userId]
    );

    res.status(200).json({
      status: 'success',
      results: reviews.length,
      data: {
        reviews
      }
    });
  } catch (error) {
    next(errorHandler(error));
  }
};

// Update review
exports.updateReview = async (req, res, next) => {
  try {
    const { rating, comment } = req.body;
    
    // Find review
    const review = await db.getById('reviews', req.params.id);
    
    if (!review) {
      return res.status(404).json({
        status: 'error',
        message: 'Review not found'
      });
    }

    // Check if user is the author of the review
    if (review.reviewer_id !== req.user.id) {
      return res.status(403).json({
        status: 'error',
        message: 'You can only update your own reviews'
      });
    }

    // Update review
    const updateData = {};
    if (rating) updateData.rating = rating;
    if (comment) updateData.comment = comment;

    await db.update('reviews', req.params.id, updateData);

    // Get updated review
    const updatedReview = await db.getById('reviews', req.params.id);

    // Update listing rating
    const listingId = review.listing_id;
    
    const [ratingData] = await db.query(
      `SELECT AVG(rating) as avg_rating, COUNT(id) as review_count
       FROM reviews
       WHERE listing_id = ?`,
      [listingId]
    );

    await db.query(
      `UPDATE listings SET 
       rating = ? 
       WHERE id = ?`,
      [ratingData.avg_rating || 0, listingId]
    );

    res.status(200).json({
      status: 'success',
      data: {
        review: updatedReview
      }
    });
  } catch (error) {
    next(errorHandler(error));
  }
};

// Delete review
exports.deleteReview = async (req, res, next) => {
  try {
    const review = await db.getById('reviews', req.params.id);
    
    if (!review) {
      return res.status(404).json({
        status: 'error',
        message: 'Review not found'
      });
    }

    // Check if user is the author of the review or admin
    if (review.reviewer_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'You are not authorized to delete this review'
      });
    }

    const listingId = review.listing_id;

    // Delete review
    await db.remove('reviews', req.params.id);

    // Update listing rating
    const [ratingData] = await db.query(
      `SELECT AVG(rating) as avg_rating, COUNT(id) as review_count
       FROM reviews
       WHERE listing_id = ?`,
      [listingId]
    );

    await db.query(
      `UPDATE listings SET 
       rating = ?, 
       review_count = ? 
       WHERE id = ?`,
      [ratingData.avg_rating || 0, ratingData.review_count || 0, listingId]
    );

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    next(errorHandler(error));
  }
};

// Host response to a review - this functionality is not supported by the current schema
// This method should be removed or the schema should be updated to include host_response fields
exports.respondToReview = async (req, res, next) => {
  try {
    return res.status(501).json({
      status: 'error',
      message: 'This functionality is not supported by the current schema'
    });
  } catch (error) {
    next(errorHandler(error));
  }
}; 