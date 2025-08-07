const db = require('../config/database');
const { errorHandler, notFound, badRequest } = require('../utils/errorHandler');

/**
 * Blocked Dates Controller
 * Handles HTTP requests for listing blocked dates
 */
const blockedDatesController = {
  /**
   * Get blocked dates for a listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getBlockedDates(req, res, next) {
    try {
      const { listingId } = req.params;
      
      // Check if listing exists
      const listing = await db.getById('listings', listingId);
      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found'
        });
      }
      
      // Get listing settings to check availability mode
      const listingSettings = await db.query(
        'SELECT * FROM listing_settings WHERE listing_id = ?',
        [listingId]
      );
      
      const availabilityMode = listingSettings.length > 0 ? 
        listingSettings[0].availability_mode : 'available-by-default';
      
      let blockedDates = [];
      
      if (availabilityMode === 'available-by-default') {
        // In available-by-default mode, return explicitly blocked dates
        blockedDates = await db.query(
          'SELECT * FROM blocked_dates WHERE listing_id = ? ORDER BY start_datetime ASC',
          [listingId]
        );
      } else {
        // In blocked-by-default mode, return available dates from availability table
        // Get available dates from the availability table
        const availableDates = await db.query(
          'SELECT * FROM availability WHERE listing_id = ? AND is_available = TRUE ORDER BY date ASC, start_time ASC',
          [listingId]
        );
        
        // Debug log to check what's coming from the database
        console.log('Available dates from DB:', availableDates);
        
        // Transform available dates to the blocked_dates format for consistency
        // We're returning available slots as "unblocked" dates
        blockedDates = availableDates.map(available => {
          try {
            // Format the date properly - it's already a Date object from the database
            const dateStr = available.date.toISOString().split('T')[0]; // Extract YYYY-MM-DD
            const startDateTime = new Date(`${dateStr}T${available.start_time}`);
            const endDateTime = new Date(`${dateStr}T${available.end_time}`);
            
            return {
              id: available.id,
              listing_id: available.listing_id,
              start_datetime: startDateTime,
              end_datetime: endDateTime,
              reason: 'Available time slot',
              created_at: available.created_at,
              is_available: true
            };
          } catch (err) {
            console.error('Error creating datetime:', err, 'for record:', available);
            return {
              id: available.id,
              listing_id: available.listing_id,
              start_datetime: null,
              end_datetime: null,
              reason: 'Available time slot (error parsing date/time)',
              created_at: available.created_at,
              is_available: true
            };
          }
        });
      }
      
      res.status(200).json({
        status: 'success',
        results: blockedDates.length,
        data: blockedDates,
        availability_mode: availabilityMode // Include mode in response
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Add blocked date to a listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async addBlockedDate(req, res, next) {
    try {
      const { listingId } = req.params;
      const { start_datetime, end_datetime, reason } = req.body;
      
      // Check if listing exists and belongs to the user
      const listing = await db.getById('listings', listingId);
      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found'
        });
      }
      
      if (listing.user_id !== req.user.id) {
        return res.status(403).json({
          status: 'error',
          message: 'You are not authorized to modify this listing'
        });
      }
      
      // Validate dates
      const startDate = new Date(start_datetime);
      const endDate = new Date(end_datetime);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid date format'
        });
      }
      
      if (startDate >= endDate) {
        return res.status(400).json({
          status: 'error',
          message: 'Start date must be before end date'
        });
      }
      
      // Check for conflicts with existing bookings
      const bookings = await db.query(`
        SELECT * FROM bookings 
        WHERE listing_id = ? AND status IN ('pending', 'confirmed')
        AND (
          (start_datetime <= ? AND end_datetime >= ?) OR
          (start_datetime <= ? AND end_datetime >= ?) OR
          (start_datetime >= ? AND end_datetime <= ?)
        )
      `, [listingId, start_datetime, start_datetime, end_datetime, end_datetime, start_datetime, end_datetime]);
      
      if (bookings.length > 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Cannot block dates that have existing bookings'
        });
      }
      
      // Add blocked date
      const blockedDateData = {
        listing_id: listingId,
        start_datetime,
        end_datetime,
        reason: reason || null
      };
      
      const result = await db.insert('blocked_dates', blockedDateData);
      
      // Get created blocked date
      const blockedDate = await db.getById('blocked_dates', result.insertId);
      
      res.status(201).json({
        status: 'success',
        data: blockedDate
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Update blocked date
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updateBlockedDate(req, res, next) {
    try {
      const { id } = req.params;
      const { start_datetime, end_datetime, reason } = req.body;
      
      // Get blocked date
      const blockedDate = await db.getById('blocked_dates', id);
      if (!blockedDate) {
        return res.status(404).json({
          status: 'error',
          message: 'Blocked date not found'
        });
      }
      
      // Check if listing belongs to the user
      const listing = await db.getById('listings', blockedDate.listing_id);
      if (listing.user_id !== req.user.id) {
        return res.status(403).json({
          status: 'error',
          message: 'You are not authorized to modify this blocked date'
        });
      }
      
      // Prepare update data
      const updateData = {};
      
      if (start_datetime) {
        updateData.start_datetime = start_datetime;
      }
      
      if (end_datetime) {
        updateData.end_datetime = end_datetime;
      }
      
      if (reason !== undefined) {
        updateData.reason = reason;
      }
      
      // Validate dates if both are provided
      if (updateData.start_datetime && updateData.end_datetime) {
        const startDate = new Date(updateData.start_datetime);
        const endDate = new Date(updateData.end_datetime);
        
        if (startDate >= endDate) {
          return res.status(400).json({
            status: 'error',
            message: 'Start date must be before end date'
          });
        }
      } else if (updateData.start_datetime) {
        const startDate = new Date(updateData.start_datetime);
        const endDate = new Date(blockedDate.end_datetime);
        
        if (startDate >= endDate) {
          return res.status(400).json({
            status: 'error',
            message: 'Start date must be before end date'
          });
        }
      } else if (updateData.end_datetime) {
        const startDate = new Date(blockedDate.start_datetime);
        const endDate = new Date(updateData.end_datetime);
        
        if (startDate >= endDate) {
          return res.status(400).json({
            status: 'error',
            message: 'Start date must be before end date'
          });
        }
      }
      
      // Check for conflicts with existing bookings
      if (updateData.start_datetime || updateData.end_datetime) {
        const startDatetime = updateData.start_datetime || blockedDate.start_datetime;
        const endDatetime = updateData.end_datetime || blockedDate.end_datetime;
        
        const bookings = await db.query(`
          SELECT * FROM bookings 
          WHERE listing_id = ? AND status IN ('pending', 'confirmed')
          AND (
            (start_datetime <= ? AND end_datetime >= ?) OR
            (start_datetime <= ? AND end_datetime >= ?) OR
            (start_datetime >= ? AND end_datetime <= ?)
          )
        `, [blockedDate.listing_id, startDatetime, startDatetime, endDatetime, endDatetime, startDatetime, endDatetime]);
        
        if (bookings.length > 0) {
          return res.status(400).json({
            status: 'error',
            message: 'Cannot block dates that have existing bookings'
          });
        }
      }
      
      // Update blocked date
      await db.update('blocked_dates', id, updateData);
      
      // Get updated blocked date
      const updatedBlockedDate = await db.getById('blocked_dates', id);
      
      res.status(200).json({
        status: 'success',
        data: updatedBlockedDate
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Delete blocked date
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async deleteBlockedDate(req, res, next) {
    try {
      const { id } = req.params;
      
      // Get blocked date
      const blockedDate = await db.getById('blocked_dates', id);
      if (!blockedDate) {
        return res.status(404).json({
          status: 'error',
          message: 'Blocked date not found'
        });
      }
      
      // Check if listing belongs to the user
      const listing = await db.getById('listings', blockedDate.listing_id);
      if (listing.user_id !== req.user.id) {
        return res.status(403).json({
          status: 'error',
          message: 'You are not authorized to delete this blocked date'
        });
      }
      
      // Delete blocked date
      await db.remove('blocked_dates', id);
      
      res.status(204).end();
    } catch (error) {
      next(errorHandler(error));
    }
  }
};

module.exports = blockedDatesController; 