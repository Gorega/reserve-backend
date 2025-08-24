const db = require('../config/database');

/**
 * Smart conflict detection for overnight bookings
 * Handles day/night unit types with intelligent overlap detection
 */
class OvernightConflictDetector {
  
  /**
   * Check for conflicts when creating blocked dates or availability
   * @param {number} listingId - The listing ID
   * @param {string} startDateTime - Start datetime
   * @param {string} endDateTime - End datetime  
   * @param {boolean} isOvernight - Whether this is an overnight booking
   * @param {string} primaryDate - The primary date for overnight bookings
   * @param {string} unitType - The listing unit type (day, night, hour, etc.)
   * @param {string} type - Type of check ('blocked_dates' or 'availability')
   * @returns {Promise<{hasConflict: boolean, conflictMessage: string}>}
   */
  static async checkConflicts(listingId, startDateTime, endDateTime, isOvernight, primaryDate, unitType, type = 'blocked_dates') {
    try {
      if (isOvernight && (unitType === 'day' || unitType === 'night')) {
        // Smart overnight logic for day/night unit types
        return await this.checkOvernightConflicts(listingId, primaryDate, type);
      } else {
        // Standard time-based conflict detection
        return await this.checkTimeBasedConflicts(listingId, startDateTime, endDateTime, type);
      }
    } catch (error) {
      console.error('Error checking conflicts:', error);
      return {
        hasConflict: true,
        conflictMessage: 'Error checking for conflicts'
      };
    }
  }

  /**
   * Check conflicts for overnight bookings on day/night unit types
   * @param {number} listingId - The listing ID
   * @param {string} primaryDate - The primary date (YYYY-MM-DD)
   * @param {string} type - Type of check ('blocked_dates' or 'availability')
   * @returns {Promise<{hasConflict: boolean, conflictMessage: string}>}
   */
  static async checkOvernightConflicts(listingId, primaryDate, type) {
    // Check for existing blocks on the primary date
    const blockConflictQuery = `
      SELECT COUNT(*) as count 
      FROM blocked_dates 
      WHERE listing_id = ? 
      AND (
        (primary_date = ? AND is_overnight = 1) OR
        (DATE(start_datetime) = ? AND is_overnight = 0)
      )
    `;
    
    const [blockResult] = await db.execute(blockConflictQuery, [
      listingId, primaryDate, primaryDate
    ]);

    if (blockResult[0].count > 0) {
      return {
        hasConflict: true,
        conflictMessage: `Date ${primaryDate} is already blocked`
      };
    }

    // Check for existing bookings on the primary date
    const bookingConflictQuery = `
      SELECT COUNT(*) as count 
      FROM bookings 
      WHERE listing_id = ? 
      AND status IN ('confirmed', 'pending')
      AND DATE(start_datetime) = ?
    `;
    
    const [bookingResult] = await db.execute(bookingConflictQuery, [
      listingId, primaryDate
    ]);

    if (bookingResult[0].count > 0) {
      return {
        hasConflict: true,
        conflictMessage: `Date ${primaryDate} already has confirmed bookings`
      };
    }

    return {
      hasConflict: false,
      conflictMessage: null
    };
  }

  /**
   * Check time-based conflicts for non-overnight bookings
   * @param {number} listingId - The listing ID
   * @param {string} startDateTime - Start datetime
   * @param {string} endDateTime - End datetime
   * @param {string} type - Type of check ('blocked_dates' or 'availability')
   * @returns {Promise<{hasConflict: boolean, conflictMessage: string}>}
   */
  static async checkTimeBasedConflicts(listingId, startDateTime, endDateTime, type) {
    const conflictQuery = `
      SELECT COUNT(*) as count 
      FROM bookings 
      WHERE listing_id = ? 
      AND status IN ('confirmed', 'pending')
      AND (
        (start_datetime <= ? AND end_datetime > ?) OR
        (start_datetime < ? AND end_datetime >= ?) OR
        (start_datetime >= ? AND start_datetime < ?)
      )
    `;
    
    const [result] = await db.execute(conflictQuery, [
      listingId, startDateTime, startDateTime, endDateTime, endDateTime, startDateTime, endDateTime
    ]);

    if (result[0].count > 0) {
      return {
        hasConflict: true,
        conflictMessage: 'Time range conflicts with existing bookings'
      };
    }

    return {
      hasConflict: false,
      conflictMessage: null
    };
  }

  /**
   * Get all conflicts for a date range (for calendar display)
   * @param {number} listingId - The listing ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<Array>} Array of conflict objects
   */
  static async getDateRangeConflicts(listingId, startDate, endDate) {
    const query = `
      SELECT 
        'blocked' as type,
        id,
        start_datetime,
        end_datetime,
        primary_date,
        is_overnight,
        reason
      FROM blocked_dates 
      WHERE listing_id = ?
      AND (
        (primary_date BETWEEN ? AND ?) OR
        (DATE(start_datetime) BETWEEN ? AND ?) OR
        (DATE(end_datetime) BETWEEN ? AND ?)
      )
      
      UNION ALL
      
      SELECT 
        'booking' as type,
        id,
        start_datetime,
        end_datetime,
        DATE(start_datetime) as primary_date,
        0 as is_overnight,
        'Booking' as reason
      FROM bookings 
      WHERE listing_id = ?
      AND status IN ('confirmed', 'pending')
      AND (
        (DATE(start_datetime) BETWEEN ? AND ?) OR
        (DATE(end_datetime) BETWEEN ? AND ?)
      )
      
      ORDER BY start_datetime
    `;
    
    const [results] = await db.execute(query, [
      listingId, startDate, endDate, startDate, endDate, startDate, endDate,
      listingId, startDate, endDate, startDate, endDate
    ]);

    return results;
  }
}

module.exports = OvernightConflictDetector;
