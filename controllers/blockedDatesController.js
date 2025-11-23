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
      
      console.log(`[DEBUG] Getting blocked dates for listing ${listingId}`);
      
      // Check if listing exists
      const listing = await db.getById('listings', listingId);
      if (!listing) {
        console.log(`[ERROR] Listing ${listingId} not found`);
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
      
      console.log(`[DEBUG] Listing ${listingId} availability mode: ${availabilityMode}`);
      
      let blockedDates = [];
      
      // Get booked dates for this listing (pending and confirmed bookings)
      console.log(`[DEBUG] Fetching booked dates for listing ${listingId}`);
      
      const bookedDates = await db.query(
        'SELECT id, listing_id, start_datetime, end_datetime, status, created_at FROM bookings WHERE listing_id = ? AND status IN (?, ?)',
        [listingId, 'pending', 'confirmed']
      );
      
      console.log(`[DEBUG] Found ${bookedDates.length} booked dates for listing ${listingId}`);
      if (bookedDates.length > 0) {
        console.log(`[DEBUG] First booked date:`, bookedDates[0]);
      }
      
      if (availabilityMode === 'available-by-default') {
        // In available-by-default mode, return explicitly blocked dates
        const rawBlockedDates = await db.query(
          'SELECT * FROM blocked_dates WHERE listing_id = ? ORDER BY start_datetime ASC',
          [listingId]
        );
        
        // CRITICAL FIX: Also fetch availability data from availability table
        console.log(`[DEBUG] Fetching availability data from availability table for listing ${listingId}`);
        const availabilityData = await db.query(
          'SELECT * FROM availability WHERE listing_id = ? ORDER BY date ASC, start_time ASC',
          [listingId]
        );
        console.log(`[DEBUG] Found ${availabilityData.length} availability entries`);
        if (availabilityData.length > 0) {
          console.log(`[DEBUG] First availability entry:`, availabilityData[0]);
        }
        
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
        
        // Add booked dates as blocked dates
        const formattedBookedDates = bookedDates.map(booking => {
          // Format datetime strings consistently
          const formatDateTime = (datetime) => {
            if (!datetime) return null;
            
            if (datetime instanceof Date) {
              return datetime.toISOString().slice(0, 19); // YYYY-MM-DDTHH:MM:SS
            }
            
            if (typeof datetime === 'string') {
              // Remove timezone info and milliseconds
              return datetime.split('.')[0].replace('Z', '');
            }
            
            return datetime;
          };
          
          return {
            id: `booking-${booking.id}`,
            listing_id: booking.listing_id,
            start_datetime: formatDateTime(booking.start_datetime),
            end_datetime: formatDateTime(booking.end_datetime),
            reason: `Booked (${booking.status})`,
            created_at: booking.created_at,
            is_available: false,
            is_booked: true,
            is_overnight: false,
            primary_date: null
          };
        });
        
        console.log(`[DEBUG] Formatted ${formattedBookedDates.length} booked dates`);
        
        // Step 2: Process availability data and add it to the response
        const formattedAvailabilityData = availabilityData.map(available => {
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
            
            // Create datetime strings by combining date with times
            let startDateTime, endDateTime;
            if (available.is_overnight && available.end_date) {
              // Handle overnight availability
              startDateTime = `${dateStr}T${available.start_time || '00:00:00'}`;
              
              // For overnight, end_date should be used
              let endDateStr;
              if (available.end_date instanceof Date) {
                const year = available.end_date.getFullYear();
                const month = String(available.end_date.getMonth() + 1).padStart(2, '0');
                const day = String(available.end_date.getDate()).padStart(2, '0');
                endDateStr = `${year}-${month}-${day}`;
              } else {
                endDateStr = available.end_date;
              }
              endDateTime = `${endDateStr}T${available.end_time || '23:59:00'}`;
            } else {
              // Regular same-day availability
              startDateTime = `${dateStr}T${available.start_time || '00:00:00'}`;
              endDateTime = `${dateStr}T${available.end_time || '23:59:00'}`;
            }
            
            return {
              id: `availability-${available.id}`, // Prefix with 'availability-' to distinguish
              listing_id: available.listing_id,
              start_datetime: startDateTime,
              end_datetime: endDateTime,
              reason: available.is_available ? 'Available time slot' : 'Unavailable time slot',
              created_at: available.created_at,
              is_available: available.is_available,
              is_overnight: available.is_overnight || false,
              primary_date: dateStr
            };
          } catch (err) {
            console.error('Error formatting availability data:', err, 'for record:', available);
            return {
              id: `availability-${available.id}`,
              listing_id: available.listing_id,
              start_datetime: null,
              end_datetime: null,
              reason: 'Available time slot (error parsing date/time)',
              created_at: available.created_at,
              is_available: available.is_available,
              is_overnight: available.is_overnight || false,
              primary_date: null
            };
          }
        });
        
        console.log(`[DEBUG] Formatted ${formattedAvailabilityData.length} availability entries`);
        
        // Combine regular blocked dates with booked dates and availability data
        blockedDates = [...blockedDates, ...formattedBookedDates, ...formattedAvailabilityData];
        
        console.log(`[DEBUG] Total entries after combining: ${blockedDates.length}`);
        console.log(`[DEBUG] Breakdown: ${blockedDates.length - formattedBookedDates.length - formattedAvailabilityData.length} manually blocked, ${formattedBookedDates.length} from bookings, ${formattedAvailabilityData.length} from availability`);
        
        if (formattedBookedDates.length > 0) {
          console.log(`[DEBUG] First booked date:`, formattedBookedDates[0]);
        }
      } else {
        // In blocked-by-default mode, only return manually blocked dates and booked dates
        // Do NOT include available dates as they are not blocked
        
        // Add booked dates as blocked in blocked-by-default mode
        const formattedBookedDates = bookedDates.map(booking => {
          const formatDateTime = (datetime) => {
            if (!datetime) return null;
            if (datetime instanceof Date) {
              return datetime.toISOString().slice(0, 19);
            }
            if (typeof datetime === 'string') {
              return datetime.split('.')[0].replace('Z', '');
            }
            return datetime;
          };
          
          return {
            id: `booking-${booking.id}`,
            listing_id: booking.listing_id,
            start_datetime: formatDateTime(booking.start_datetime),
            end_datetime: formatDateTime(booking.end_datetime),
            reason: `Booked (${booking.status})`,
            created_at: booking.created_at,
            is_available: false,
            is_booked: true
          };
        });
        
        // Only include manually blocked dates and booked dates
        blockedDates = [...blockedDates, ...formattedBookedDates];
        console.log(`[DEBUG] Blocked-by-default mode: ${blockedDates.length - formattedBookedDates.length} manually blocked, ${formattedBookedDates.length} booked dates`);
      }
      
      // CRITICAL FIX: Log the response we're about to send
      console.log(`[DEBUG] Sending response with ${blockedDates.length} blocked dates`);
      
      // Make sure bookedInFinal is defined for the blocked-by-default mode as well
      const bookedInFinal = blockedDates.filter(date => 
        (date.is_booked === true) || 
        (date.reason && date.reason.includes('Booked')) || 
        (date.id && typeof date.id === 'string' && date.id.includes('booking-'))
      );
      
      console.log(`[DEBUG] Blocked dates breakdown: ${blockedDates.length - bookedInFinal.length} manually blocked, ${bookedInFinal.length} from bookings`);
      
      // Ensure we have the correct structure
      const responseData = {
        status: 'success',
        results: blockedDates.length,
        data: blockedDates,
        availability_mode: availabilityMode // Include mode in response
      };
      
      // Log the first few items to verify structure
      if (blockedDates.length > 0) {
        console.log(`[DEBUG] First blocked date in response:`, blockedDates[0]);
      }
      
      if (bookedInFinal.length > 0) {
        console.log(`[DEBUG] First booked date in response:`, bookedInFinal[0]);
      }
      
      res.status(200).json(responseData);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get availability data for guest reservation screens
   * Returns available dates/times and booked dates in a format suitable for calendar display
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getGuestAvailability(req, res, next) {
    try {
      const { listingId } = req.params;
      
      console.log(`[DEBUG] Getting guest availability for listing ${listingId}`);
      
      // Check if listing exists
      const listing = await db.getById('listings', listingId);
      if (!listing) {
        console.log(`[ERROR] Listing ${listingId} not found`);
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
      
      console.log(`[DEBUG] Listing ${listingId} availability mode: ${availabilityMode}`);
      
      // Get booked dates (confirmed and pending bookings)
      const bookedDates = await db.query(
        'SELECT id, listing_id, start_datetime, end_datetime, status, created_at FROM bookings WHERE listing_id = ? AND status IN (?, ?)',
        [listingId, 'pending', 'confirmed']
      );
      
      console.log(`[DEBUG] Found ${bookedDates.length} booked dates for listing ${listingId}`);
      
      // Get blocked dates
      const blockedDates = await db.query(
        'SELECT * FROM blocked_dates WHERE listing_id = ? ORDER BY start_datetime ASC',
        [listingId]
      );
      
      // Get availability data
      const availabilityData = await db.query(
        'SELECT * FROM availability WHERE listing_id = ? ORDER BY date ASC, start_time ASC',
        [listingId]
      );
      
      console.log(`[DEBUG] Found ${availabilityData.length} availability entries`);
      
      // Format response data for guest calendar
      const response = {
        availability_mode: availabilityMode,
        booked_dates: bookedDates.map(booking => ({
          id: `booking-${booking.id}`,
          start_datetime: booking.start_datetime,
          end_datetime: booking.end_datetime,
          reason: `Booked (${booking.status})`,
          is_available: false,
          is_booked: true,
          type: 'booking'
        })),
        blocked_dates: blockedDates.map(blocked => ({
          id: blocked.id,
          start_datetime: blocked.start_datetime,
          end_datetime: blocked.end_datetime,
          reason: blocked.reason || 'Blocked',
          is_available: false,
          is_booked: false,
          type: 'blocked'
        })),
        available_dates: availabilityData.map(available => {
          // Create datetime strings by combining date with times
          let startDateTime, endDateTime;
          
          if (available.date && available.start_time) {
            const dateStr = available.date.toString().split('T')[0]; // Get YYYY-MM-DD
            startDateTime = `${dateStr}T${available.start_time}`;
            endDateTime = available.end_time ? `${dateStr}T${available.end_time}` : startDateTime;
          }
          
          return {
            id: available.id,
            start_datetime: startDateTime,
            end_datetime: endDateTime,
            date: available.date,
            start_time: available.start_time,
            end_time: available.end_time,
            is_available: true,
            is_booked: false,
            is_overnight: available.is_overnight || false,
            type: 'available'
          };
        })
      };
      
      res.status(200).json({
        status: 'success',
        data: response
      });
      
    } catch (error) {
      console.error('Error getting guest availability:', error);
      next(error);
    }
  },

  /**
   * Add a new blocked date
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