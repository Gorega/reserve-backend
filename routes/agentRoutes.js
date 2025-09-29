const express = require('express');
const agentController = require('../controllers/agentController');
const { protect } = require('../middleware/authMiddleware');
const { validate, idParamValidation } = require('../middleware/validationMiddleware');
const { query, param } = require('express-validator');

const router = express.Router();

// Middleware to protect all agent routes - user must be authenticated
router.use(protect);

/**
 * @route   GET /api/agents/search-users
 * @desc    Search users by name or phone number and return their pending bookings
 * @access  Private (Agents only)
 * @query   search - Search term (name or phone number)
 */
router.get(
  '/search-users',
  [
    query('search')
      .notEmpty()
      .withMessage('Search term is required')
      .isLength({ min: 2 })
      .withMessage('Search term must be at least 2 characters long')
      .trim()
      .escape()
  ],
  validate,
  agentController.searchUserWithBookings
);



/**
 * @route   PUT /api/agents/bookings/:bookingId/confirm
 * @desc    Confirm a booking (change status to confirmed)
 * @access  Private (Agents only)
 * @param   bookingId - ID of the booking to confirm
 */
router.put(
  '/bookings/:bookingId/confirm',
  [
    param('bookingId')
      .isInt({ min: 1 })
      .withMessage('Booking ID must be a positive integer')
      .toInt()
  ],
  validate,
  agentController.confirmBooking
);

/**
 * @route   GET /api/agents/bookings/:bookingId
 * @desc    Get detailed information about a specific booking (for agents)
 * @access  Private (Agents only)
 * @param   bookingId - ID of the booking
 */
router.get(
  '/bookings/:bookingId',
  [
    param('bookingId')
      .isInt({ min: 1 })
      .withMessage('Booking ID must be a positive integer')
      .toInt()
  ],
  validate,
  async (req, res, next) => {
    try {
      const { bookingId } = req.params;
      const db = require('../config/database');
      const { notFound, forbidden } = require('../utils/errorHandler');
      
      // Verify that the requesting user is an agent
      const agentCheckQuery = 'SELECT is_agent FROM users WHERE id = ?';
      const agentResult = await db.query(agentCheckQuery, [req.user.id]);
      
      if (!agentResult || agentResult.length === 0 || !agentResult[0].is_agent) {
        return next(forbidden('Access denied. Agent privileges required.'));
      }
      
      // Get detailed booking information
      const bookingQuery = `
        SELECT 
          b.*,
          u.name as user_name,
          u.email as user_email,
          u.phone as user_phone,
          u.profile_image as user_profile_image,
          l.title as listing_title,
          l.description as listing_description,
          l.location as listing_location,
          l.price_per_hour,
          l.price_per_day,
          l.unit_type as listing_unit_type,
          l.instant_booking,
          l.cancellation_policy,
          provider.name as provider_name,
          provider.email as provider_email,
          provider.phone as provider_phone,
          provider.profile_image as provider_profile_image,
          confirmer.name as confirmed_by_name,
          (SELECT image_url FROM listing_photos WHERE listing_id = l.id AND is_cover = 1 LIMIT 1) as listing_cover_photo,
          (SELECT JSON_ARRAYAGG(image_url) FROM listing_photos WHERE listing_id = l.id) as listing_photos
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        JOIN listings l ON b.listing_id = l.id
        JOIN users provider ON l.user_id = provider.id
        LEFT JOIN users confirmer ON b.confirmed_by_user_id = confirmer.id
        WHERE b.id = ?
      `;
      
      const bookingResult = await db.query(bookingQuery, [bookingId]);
      
      if (!bookingResult || bookingResult.length === 0) {
        return next(notFound('Booking not found'));
      }
      
      const booking = bookingResult[0];
      
      // Parse JSON fields if they exist
      if (booking.listing_photos) {
        try {
          booking.listing_photos = JSON.parse(booking.listing_photos);
        } catch (e) {
          booking.listing_photos = [];
        }
      }
      
      res.status(200).json({
        status: 'success',
        message: 'Booking details retrieved successfully',
        data: {
          booking
        }
      });
      
    } catch (error) {
      console.error('Error in get booking details:', error);
      next(error);
    }
  }
);

module.exports = router;