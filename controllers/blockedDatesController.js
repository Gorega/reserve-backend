const db = require('../config/database');
const { errorHandler, notFound, badRequest } = require('../utils/errorHandler');
const { toUTCDateString, createUTCDateTime, extractTimeFromDateTime, extractDateFromDateTime, doDateRangesOverlap, startOfDay, endOfDay } = require('../utils/dateUtils');

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
        const rawBlockedDates = await db.query(
          'SELECT * FROM blocked_dates WHERE listing_id = ? ORDER BY start_datetime ASC',
          [listingId]
        );
        
        // Format blocked dates to match the same format as available dates
        blockedDates = rawBlockedDates.map(blocked => {
          try {
            // Extract date and time parts from start_datetime and end_datetime
            let startDateTime, endDateTime;
            
            if (blocked.start_datetime) {
              if (typeof blocked.start_datetime === 'string' && blocked.start_datetime.includes('T')) {
                // Remove timezone info if present and keep just YYYY-MM-DDTHH:MM:SS format
                startDateTime = blocked.start_datetime.split('.')[0].replace('Z', '');
              } else if (blocked.start_datetime instanceof Date) {
                // For Date objects, format without timezone
                const year = blocked.start_datetime.getFullYear();
                const month = String(blocked.start_datetime.getMonth() + 1).padStart(2, '0');
                const day = String(blocked.start_datetime.getDate()).padStart(2, '0');
                const hours = String(blocked.start_datetime.getHours()).padStart(2, '0');
                const minutes = String(blocked.start_datetime.getMinutes()).padStart(2, '0');
                const seconds = String(blocked.start_datetime.getSeconds()).padStart(2, '0');
                startDateTime = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
              } else {
                startDateTime = blocked.start_datetime;
              }
            }
            
            if (blocked.end_datetime) {
              if (typeof blocked.end_datetime === 'string' && blocked.end_datetime.includes('T')) {
                // Remove timezone info if present and keep just YYYY-MM-DDTHH:MM:SS format
                endDateTime = blocked.end_datetime.split('.')[0].replace('Z', '');
              } else if (blocked.end_datetime instanceof Date) {
                // For Date objects, format without timezone
                const year = blocked.end_datetime.getFullYear();
                const month = String(blocked.end_datetime.getMonth() + 1).padStart(2, '0');
                const day = String(blocked.end_datetime.getDate()).padStart(2, '0');
                const hours = String(blocked.end_datetime.getHours()).padStart(2, '0');
                const minutes = String(blocked.end_datetime.getMinutes()).padStart(2, '0');
                const seconds = String(blocked.end_datetime.getSeconds()).padStart(2, '0');
                endDateTime = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
              } else {
                endDateTime = blocked.end_datetime;
              }
            }
            
            return {
              id: blocked.id,
              listing_id: blocked.listing_id,
              start_datetime: startDateTime,
              end_datetime: endDateTime,
              reason: blocked.reason || '',
              created_at: blocked.created_at,
              is_available: false,
              is_overnight: blocked.is_overnight || false,
              primary_date: blocked.primary_date || null
            };
          } catch (err) {
            console.error('Error formatting blocked date:', err, 'for record:', blocked);
            return {
              id: blocked.id,
              listing_id: blocked.listing_id,
              start_datetime: null,
              end_datetime: null,
              reason: blocked.reason || 'Error parsing date/time',
              created_at: blocked.created_at,
              is_available: false,
              is_overnight: blocked.is_overnight || false,
              primary_date: blocked.primary_date || null
            };
          }
        });
      } else {
        // In blocked-by-default mode, return available dates from availability table
        // Get available dates from the availability table
        const availableDates = await db.query(
          'SELECT * FROM availability WHERE listing_id = ? AND is_available = TRUE ORDER BY date ASC, start_time ASC',
          [listingId]
        );
        

        
        // Transform available dates to the blocked_dates format for consistency
        // We're returning available slots as "unblocked" dates
        blockedDates = availableDates.map(available => {
          try {
            // Use the date directly as YYYY-MM-DD format without timezone conversion
            let dateStr;
            if (available.date) {
              // Extract just the date part (YYYY-MM-DD) from any date format
              if (typeof available.date === 'string' && available.date.includes('T')) {
                dateStr = available.date.split('T')[0];
              } else if (available.date instanceof Date) {
                // For Date objects, use getFullYear, getMonth, getDate to avoid timezone issues
                const year = available.date.getFullYear();
                const month = String(available.date.getMonth() + 1).padStart(2, '0');
                const day = String(available.date.getDate()).padStart(2, '0');
                dateStr = `${year}-${month}-${day}`;

              } else {
                dateStr = available.date;
              }
            }
            
            // Create datetime strings by combining date with times, but keep them simple
            const startDateTime = `${dateStr}T${available.start_time || '00:00:00'}`;
            const endDateTime = `${dateStr}T${available.end_time || '23:59:00'}`;
            
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
      next(error);
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
      const { start_datetime, end_datetime, reason, is_overnight, primary_date } = req.body;
      
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
      
      // Validate dates using our utility functions
      try {
        // Ensure we're working with proper UTC dates
        const startDate = new Date(start_datetime);
        const endDate = new Date(end_datetime);
        
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return res.status(400).json({
            status: 'error',
            message: 'Invalid date format'
          });
        }
      
      // Allow any start/end time combination - no validation needed
      } catch (err) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid date format: ' + err.message
        });
      }
      
      // Insert blocked date with overnight support
      const insertQuery = `
        INSERT INTO blocked_dates (listing_id, start_datetime, end_datetime, reason, is_overnight, primary_date)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      const [result] = await db.execute(insertQuery, [
        listingId, start_datetime, end_datetime, reason || null, is_overnight || false, primary_date || null
      ]);

      res.status(201).json({
        status: 'success',
        message: 'Blocked date added successfully',
        data: {
          id: result.insertId,
          listing_id: listingId,
          start_datetime,
          end_datetime,
          reason,
          is_overnight: is_overnight || false,
          primary_date: primary_date || null
        }
      });
    } catch (error) {
      next(error);
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
      
      // Validate dates if both are provided using our utility functions
      if (updateData.start_datetime && updateData.end_datetime) {
        try {
          const startDate = new Date(updateData.start_datetime);
          const endDate = new Date(updateData.end_datetime);
          
          // Allow any start/end time combination - no validation needed
        } catch (err) {
          return res.status(400).json({
            status: 'error',
            message: 'Invalid date format: ' + err.message
          });
        }
      } else if (updateData.start_datetime) {
        try {
          const startDate = new Date(updateData.start_datetime);
          const endDate = new Date(blockedDate.end_datetime);
          
          // Allow any start/end time combination - no validation needed
        } catch (err) {
          return res.status(400).json({
            status: 'error',
            message: 'Invalid date format: ' + err.message
          });
        }
      } else if (updateData.end_datetime) {
        try {
          const startDate = new Date(blockedDate.start_datetime);
          const endDate = new Date(updateData.end_datetime);
          
          // Allow any start/end time combination - no validation needed
        } catch (err) {
          return res.status(400).json({
            status: 'error',
            message: 'Invalid date format: ' + err.message
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
      next(error);
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
      next(error);
    }
  }
};

module.exports = blockedDatesController; 