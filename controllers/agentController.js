const db = require('../config/database');
const { badRequest, notFound, forbidden } = require('../utils/errorHandler');

/**
 * Agent Controller
 * Handles HTTP requests for agent operations
 * Only users with is_agent = true can access these endpoints
 */
const agentController = {
  /**
   * Search users by name or phone number and return their pending bookings
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async searchUserWithBookings(req, res, next) {
    try {
      const { search } = req.query;
      
      // Validate search parameter
      if (!search || search.trim().length < 2) {
        return next(badRequest('Search term must be at least 2 characters long'));
      }
      
      // Verify that the requesting user is an agent
      const agentCheckQuery = 'SELECT is_agent FROM users WHERE id = ?';
      const agentResult = await db.query(agentCheckQuery, [req.user.id]);
      
      if (!agentResult || agentResult.length === 0 || !agentResult[0].is_agent) {
        return next(forbidden('Access denied. Agent privileges required.'));
      }
      
      const searchTerm = search.trim();
      
      // Search for users by name or phone number
      const userSearchQuery = `
        SELECT 
          u.id,
          u.name,
          u.email,
          u.phone,
          u.profile_image,
          u.created_at
        FROM users u
        WHERE (u.name LIKE ? OR u.phone LIKE ?)
        ORDER BY u.name ASC
      `;
      
      const users = await db.query(userSearchQuery, [
        `%${searchTerm}%`,
        `%${searchTerm}%`
      ]);
      
      if (!users.length) {
        return res.status(200).json({
          status: 'success',
          message: 'No users found matching the search criteria',
          data: {
            users: [],
            totalUsers: 0
          }
        });
      }
      
      // Get user IDs for booking search
      const userIds = users.map(user => user.id);
      const placeholders = userIds.map(() => '?').join(',');
      
      // Get pending bookings for found users
      let userBookings = [];
      if (userIds.length > 0) {
        const userBookingsQuery = `
          SELECT 
            b.*,
            l.title as listing_title,
            l.location as listing_location,
            l.price_per_hour,
            l.price_per_day,
            l.unit_type as listing_unit_type,
            l.user_id as provider_id,
            provider.name as provider_name,
            provider.phone as provider_phone,
            (SELECT image_url FROM listing_photos WHERE listing_id = l.id AND is_cover = 1 LIMIT 1) as listing_cover_photo
          FROM bookings b
          JOIN listings l ON b.listing_id = l.id
          JOIN users provider ON l.user_id = provider.id
          WHERE b.user_id IN (${placeholders}) 
            AND b.status = 'pending'
          ORDER BY b.created_at DESC
        `;
        
        userBookings = await db.query(userBookingsQuery, userIds);
      }
      
      // Get ALL pending bookings with deposit_paid status for agents to confirm
      const allPendingBookingsQuery = `
        SELECT 
          b.*,
          u.name as user_first_name,
          u.email as user_email,
          u.phone as user_phone,
          l.title as listing_title,
          l.location as listing_location,
          l.price_per_hour,
          l.price_per_day,
          l.unit_type as listing_unit_type,
          provider.name as provider_first_name,
          provider.phone as provider_phone,
          (SELECT image_url FROM listing_photos WHERE listing_id = l.id AND is_cover = 1 LIMIT 1) as listing_cover_photo
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        JOIN listings l ON b.listing_id = l.id
        JOIN users provider ON l.user_id = provider.id
        WHERE b.status = 'pending' 
          AND b.payment_status = 'deposit_paid'
        ORDER BY b.created_at DESC
        LIMIT 50
      `;
      
      const allPendingBookings = await db.query(allPendingBookingsQuery, []);
      
      // Group bookings by user for searched users
      const usersWithBookings = users.map(user => {
        const userSpecificBookings = userBookings.filter(booking => booking.user_id === user.id);
        return {
          ...user,
          pending_bookings: userSpecificBookings,
          pending_bookings_count: userSpecificBookings.length
        };
      });
      
      res.status(200).json({
        status: 'success',
        message: 'Users found successfully',
        data: {
          searched_users: usersWithBookings,
          total_searched_users: users.length,
          all_pending_bookings: allPendingBookings,
          total_pending_bookings: allPendingBookings.length
        }
      });
      
    } catch (error) {
      console.error('Error in searchUserWithBookings:', error);
      next(error);
    }
  },

  /**
   * Confirm a booking (change status to confirmed and set confirmation details)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async confirmBooking(req, res, next) {
    try {
      const { bookingId } = req.params;
      
      // Validate booking ID
      if (!bookingId || isNaN(bookingId)) {
        return next(badRequest('Valid booking ID is required'));
      }
      
      // Verify that the requesting user is an agent
      const agentCheckQuery = 'SELECT is_agent FROM users WHERE id = ?';
      const agentResult = await db.query(agentCheckQuery, [req.user.id]);
      
      if (!agentResult || agentResult.length === 0 || !agentResult[0].is_agent) {
        return next(forbidden('Access denied. Agent privileges required.'));
      }
      
      // Check if booking exists and get its current status
      const bookingCheckQuery = `
        SELECT 
          b.*,
          l.title as listing_title,
          u.name as user_name,
          u.phone as user_phone
        FROM bookings b
        JOIN listings l ON b.listing_id = l.id
        JOIN users u ON b.user_id = u.id
        WHERE b.id = ?
      `;
      
      const bookingResult = await db.query(bookingCheckQuery, [bookingId]);
    
    if (!bookingResult || bookingResult.length === 0) {
      return next(notFound('Booking not found'));
    }
    
    const booking = bookingResult[0];
    
    // Check if booking is in pending status
    if (booking.status !== 'pending') {
      return next(badRequest(`Booking cannot be confirmed. Current status: ${booking.status}`));
    }
      
      // Update booking status to confirmed and set confirmation details
      const updateQuery = `
        UPDATE bookings 
        SET 
          status = 'confirmed',
          payment_status = 'deposit_paid',
          confirmed_by_user_id = ?,
          confirmed_at = NOW(),
          updated_at = NOW()
        WHERE id = ?
      `;
      
      const updateResult = await db.query(updateQuery, [req.user.id, bookingId]);
    
    if (updateResult.affectedRows === 0) {
      return next(badRequest('Failed to confirm booking'));
    }
    
    // Get the updated booking details
    const updatedBooking = await db.query(bookingCheckQuery, [bookingId]);
    
    res.status(200).json({
      status: 'success',
      message: 'Booking confirmed successfully',
      data: {
        booking: updatedBooking[0],
        confirmed_by_agent_id: req.user.id,
          confirmed_at: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error('Error in confirmBooking:', error);
      next(error);
    }
  },

};

module.exports = agentController;