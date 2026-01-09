const db = require('../config/database');
const { errorHandler, notFound, badRequest } = require('../utils/errorHandler');
const { toUTCDateString, createUTCDateTime, extractTimeFromDateTime, extractDateFromDateTime, doDateRangesOverlap, startOfDay, endOfDay } = require('../utils/dateUtils');
const { getFileUrl, deleteFile, uploadToCloudinary } = require('../utils/fileUpload');

/**
 * Convert datetime to MySQL format without timezone conversion
 * @param {string|Date} dateTime - Datetime string or Date object
 * @returns {string} MySQL datetime format (YYYY-MM-DD HH:MM:SS)
 */
const toMySQLDateTime = (dateTime) => {
  if (!dateTime) return null;

  // If it's already in MySQL format, return as is
  if (typeof dateTime === 'string' && dateTime.includes(' ') && !dateTime.includes('T')) {
    return dateTime;
  }

  // If it's in ISO format, just replace T with space
  if (typeof dateTime === 'string' && dateTime.includes('T')) {
    return dateTime.replace('T', ' ').split('.')[0]; // Remove milliseconds if present
  }

  // If it's a Date object, format it preserving local time
  if (dateTime instanceof Date) {
    const year = dateTime.getFullYear();
    const month = String(dateTime.getMonth() + 1).padStart(2, '0');
    const day = String(dateTime.getDate()).padStart(2, '0');
    const hours = String(dateTime.getHours()).padStart(2, '0');
    const minutes = String(dateTime.getMinutes()).padStart(2, '0');
    const seconds = String(dateTime.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  return dateTime;
};

/**
 * Constants for availability system
 */
const BOOKING_STATUSES = ['pending', 'confirmed'];
const DEFAULT_SLOT_DURATION = 60; // Default slot duration in minutes

/**
 * Helper function to check for reservation conflicts using unified datetime approach
 * @param {string} listingId - The listing ID
 * @param {string} startDateTime - Start datetime in ISO format or MySQL datetime format
 * @param {string} endDateTime - End datetime in ISO format or MySQL datetime format
 * @param {Array} excludeBookingIds - Optional array of booking IDs to exclude from conflict check
 * @returns {Array} Array of conflicting bookings
 */
const checkReservationConflicts = async (listingId, startDateTime, endDateTime, excludeBookingIds = []) => {
  try {
    // Normalize datetime formats to MySQL format for consistent comparison
    const normalizedStartDateTime = toMySQLDateTime(startDateTime);
    const normalizedEndDateTime = toMySQLDateTime(endDateTime);

    // Check for existing confirmed bookings that overlap with this availability slot
    // Two time ranges overlap if: start1 < end2 AND start2 < end1
    let query = `
      SELECT id, start_datetime, end_datetime, status
      FROM bookings 
      WHERE listing_id = ? 
      AND status IN ('confirmed', 'pending')
      AND start_datetime < ? 
      AND end_datetime > ?`;

    const queryParams = [
      listingId,
      normalizedEndDateTime,   // Booking starts before availability ends
      normalizedStartDateTime  // Booking ends after availability starts
    ];

    // Add exclusion for specific booking IDs if provided
    if (excludeBookingIds && excludeBookingIds.length > 0) {
      query += ` AND id NOT IN (${excludeBookingIds.map(() => '?').join(',')})`;
      queryParams.push(...excludeBookingIds);
    }

    const conflictingBookings = await db.query(query, queryParams);


    return conflictingBookings;
  } catch (error) {
    console.error('Error checking reservation conflicts:', error);
    return [];
  }
};

/**
 * Legacy helper function for backward compatibility
 * @deprecated Use checkReservationConflicts with datetime parameters instead
 */
const checkReservationConflictsLegacy = async (listingId, checkDate, checkStartTime, checkEndTime, checkEndDate = null, is_overnight = false) => {
  let startDateTime, endDateTime;

  try {
    if (checkEndDate && is_overnight) {
      startDateTime = createUTCDateTime(checkDate, checkStartTime);
      endDateTime = createUTCDateTime(checkEndDate, checkEndTime);
    } else {
      startDateTime = createUTCDateTime(checkDate, checkStartTime);
      endDateTime = createUTCDateTime(checkDate, checkEndTime);
    }

    return await checkReservationConflicts(listingId, startDateTime, endDateTime);
  } catch (error) {
    console.error('Error in legacy conflict check:', error);
    return [];
  }
};

/**
 * Get partial availability by splitting time slots around bookings
 * @param {number} listingId - Listing ID
 * @param {string} startDateTime - Start datetime of availability slot
 * @param {string} endDateTime - End datetime of availability slot
 * @param {Object} originalSlot - Original availability slot object
 * @returns {Promise<Array>} - Array of available time slots
 */
const getPartialAvailability = async (listingId, startDateTime, endDateTime, originalSlot) => {
  try {
    // Get all bookings that overlap with this time slot
    const conflicts = await checkReservationConflicts(listingId, startDateTime, endDateTime);

    if (conflicts.length === 0) {
      // No conflicts, return the original slot
      return [originalSlot];
    }

    // Convert datetime strings to Date objects for easier manipulation
    const slotStart = new Date(startDateTime);
    const slotEnd = new Date(endDateTime);

    // Sort conflicts by start time
    const sortedConflicts = conflicts.sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));

    const availableSlots = [];
    let currentStart = slotStart;

    for (const conflict of sortedConflicts) {
      const conflictStart = new Date(conflict.start_datetime);
      const conflictEnd = new Date(conflict.end_datetime);

      // If there's a gap before this conflict, create an available slot
      if (currentStart < conflictStart) {
        const availableEnd = new Date(Math.min(conflictStart.getTime(), slotEnd.getTime()));

        if (currentStart < availableEnd) {
          availableSlots.push({
            ...originalSlot,
            id: `${originalSlot.id}_partial_${availableSlots.length + 1}`,
            start_datetime: toMySQLDateTime(currentStart),
            end_datetime: toMySQLDateTime(availableEnd),
            start_time: extractTimeFromDateTime(currentStart.toISOString()),
            end_time: extractTimeFromDateTime(availableEnd.toISOString()),
            is_partial: true
          });
        }
      }

      // Move current start to after this conflict
      currentStart = new Date(Math.max(conflictEnd.getTime(), currentStart.getTime()));
    }

    // If there's time remaining after all conflicts, create a final available slot
    if (currentStart < slotEnd) {
      availableSlots.push({
        ...originalSlot,
        id: `${originalSlot.id}_partial_${availableSlots.length + 1}`,
        start_datetime: toMySQLDateTime(currentStart),
        end_datetime: toMySQLDateTime(slotEnd),
        start_time: extractTimeFromDateTime(currentStart.toISOString()),
        end_time: extractTimeFromDateTime(slotEnd.toISOString()),
        is_partial: true
      });
    }

    return availableSlots;
  } catch (error) {
    console.error('Error getting partial availability:', error);
    // Return original slot if there's an error
    return [originalSlot];
  }
};

/**
 * Check if a time slot is within the allowed booking hours for a listing
 * @param {number} listingId - The listing ID
 * @param {string} startDateTime - Start datetime in ISO format or MySQL datetime format
 * @param {string} endDateTime - End datetime in ISO format or MySQL datetime format
 * @returns {Promise<boolean>} True if the slot is within allowed hours, false otherwise
 */
const isWithinAllowedHours = async (listingId, startDateTime, endDateTime) => {
  try {
    // Get listing settings
    const [listingSettings] = await db.query(
      'SELECT * FROM listing_settings WHERE listing_id = ?',
      [listingId]
    );

    if (!listingSettings) {
      // If no settings found, assume it's allowed (default behavior)
      return true;
    }

    // Get current time for min_advance_booking_hours check
    const currentTime = new Date();
    const startTime = new Date(startDateTime);
    const endTime = new Date(endDateTime);

    // Check minimum advance booking hours
    if (listingSettings.min_advance_booking_hours) {
      const minAdvanceTime = new Date(currentTime);
      minAdvanceTime.setHours(currentTime.getHours() + listingSettings.min_advance_booking_hours);

      if (startTime < minAdvanceTime) {
        // Booking starts too soon
        return false;
      }
    }

    // Check maximum advance booking days
    if (listingSettings.max_advance_booking_days) {
      const maxAdvanceTime = new Date(currentTime);
      maxAdvanceTime.setDate(currentTime.getDate() + listingSettings.max_advance_booking_days);

      if (startTime > maxAdvanceTime) {
        // Booking starts too far in the future
        return false;
      }
    }

    // All checks passed
    return true;
  } catch (error) {
    console.error('Error checking allowed hours:', error);
    // Default to allowed if there's an error
    return true;
  }
};

/**
 * Check for blocked dates that overlap with a given time slot
 * @param {number} listingId - The listing ID
 * @param {string} startDateTime - Start datetime in ISO format or MySQL datetime format
 * @param {string} endDateTime - End datetime in ISO format or MySQL datetime format
 * @returns {Promise<Array>} Array of overlapping blocked dates
 */
const checkBlockedDateConflicts = async (listingId, startDateTime, endDateTime) => {
  try {
    // Normalize datetime formats
    const normalizedStartDateTime = toMySQLDateTime(startDateTime);
    const normalizedEndDateTime = toMySQLDateTime(endDateTime);

    // Check for overlapping blocked dates
    const blockedDates = await db.query(`
      SELECT id, start_datetime, end_datetime, reason
      FROM blocked_dates
      WHERE listing_id = ?
      AND start_datetime < ?
      AND end_datetime > ?
    `, [
      listingId,
      normalizedEndDateTime,   // Blocked date starts before slot ends
      normalizedStartDateTime  // Blocked date ends after slot starts
    ]);

    return blockedDates;
  } catch (error) {
    console.error('Error checking blocked date conflicts:', error);
    return [];
  }
};

/**
 * Subtract reservations from available slots by splitting them into smaller time ranges
 * This is the exact implementation requested by the user
 * @param {Array} slots - Array of available slots with start and end timestamps
 * @param {Array} reservations - Array of reservations with start and end timestamps
 * @returns {Array} Array of available slots after subtracting reservations
 */
const subtractReservationsFromSlots = (slots, reservations) => {
  let available = [];

  for (let slot of slots) {

    let current = [slot.start, slot.end];

    // Sort reservations inside this slot
    let overlaps = reservations.filter(r => {
      const overlaps = r.start < current[1] && r.end > current[0];
      return overlaps;
    }).sort((a, b) => a.start - b.start);

    // If no overlaps, keep the entire slot
    if (overlaps.length === 0) {
      available.push({
        ...slot,
        id: `${slot.id}_full`,
        slot_type: 'regular'
      });
      continue;
    }

    let pointer = current[0];
    for (let res of overlaps) {
      if (pointer < res.start) {
        available.push({
          ...slot,
          start: pointer,
          end: res.start,
          id: `${slot.id}_split_${available.length + 1}`,
          slot_type: 'split'
        });
      }
      pointer = Math.max(pointer, res.end);
    }

    if (pointer < current[1]) {
      available.push({
        ...slot,
        start: pointer,
        end: current[1],
        id: `${slot.id}_split_${available.length + 1}`,
        slot_type: 'split'
      });
    }
  }

  return available;
};

/**
 * Split available slots into duration-based time periods
 * @param {Array} slots - Array of available slots with start and end timestamps
 * @param {number} durationHours - Duration in hours for each slot
 * @param {string} bookingType - Booking type ('daily', 'hourly', etc.)
 * @returns {Array} Array of duration-based time slots
 */
const generateDurationBasedSlots = (slots, durationHours = 1, bookingType = 'hourly') => {
  const durationSlots = [];

  for (const slot of slots) {
    // For daily/night bookings, don't split further - keep as full periods
    if (bookingType === 'daily' || bookingType === 'night') {
      durationSlots.push({
        ...slot,
        booking_duration_hours: Math.ceil((slot.end - slot.start) / (1000 * 60 * 60))
      });
      continue;
    }

    // For hourly bookings, split into duration-based slots
    const slotDurationMs = slot.end - slot.start;
    const requestedDurationMs = durationHours * 60 * 60 * 1000;

    // If the slot is shorter than the requested duration, skip it
    if (slotDurationMs < requestedDurationMs) {
      continue;
    }

    // Generate consecutive slots of the specified duration
    let currentStart = slot.start;
    let slotIndex = 1;

    while (currentStart + requestedDurationMs <= slot.end) {
      const currentEnd = currentStart + requestedDurationMs;

      durationSlots.push({
        ...slot,
        start: currentStart,
        end: currentEnd,
        id: `${slot.id}_duration_${slotIndex}`,
        slot_type: slot.slot_type === 'split' ? 'split_duration' : 'duration',
        booking_duration_hours: durationHours
      });

      currentStart = currentEnd;
      slotIndex++;
    }

    // Handle remaining time if it's significant (at least 50% of duration)
    const remainingMs = slot.end - currentStart;
    const remainingHours = remainingMs / (1000 * 60 * 60);

    if (remainingHours >= durationHours * 0.5) {
      durationSlots.push({
        ...slot,
        start: currentStart,
        end: slot.end,
        id: `${slot.id}_duration_${slotIndex}_partial`,
        slot_type: slot.slot_type === 'split' ? 'split_partial' : 'partial',
        booking_duration_hours: remainingHours
      });
    }
  }

  return durationSlots;
};

/**
 * Convert slots with timestamp format to datetime format for database storage
 * @param {Array} slots - Array of slots with start/end timestamps
 * @returns {Array} Array of slots with start_datetime/end_datetime
 */
const convertSlotsToDatetimeFormat = (slots) => {
  return slots.map(slot => ({
    ...slot,
    start_datetime: toMySQLDateTime(new Date(slot.start)),
    end_datetime: toMySQLDateTime(new Date(slot.end))
  }));
};

/**
 * Clean up available_slots by removing conflicts with bookings and blocked dates
 * @param {number} listingId - The listing ID
 * @returns {Promise<void>}
 */
const cleanupAvailableSlots = async (listingId) => {
  try {
    // Get a connection for transaction
    const connection = await db.getPool().getConnection();
    await connection.beginTransaction();

    try {
      // Get all available slots for this listing
      const availableSlots = await connection.query(`
        SELECT * FROM available_slots
        WHERE listing_id = ? AND is_available = TRUE
        ORDER BY start_datetime ASC
      `, [listingId]);

      if (availableSlots.length === 0) {
        await connection.commit();
        return;
      }

      // Get all confirmed and pending bookings for this listing
      const bookings = await connection.query(`
        SELECT id, start_datetime, end_datetime, status
        FROM bookings 
        WHERE listing_id = ? 
        AND status IN ('pending', 'confirmed', 'completed')
      `, [listingId]);

      // Get all blocked dates for this listing
      const blockedDates = await connection.query(`
        SELECT id, start_datetime, end_datetime
        FROM blocked_dates 
        WHERE listing_id = ?
      `, [listingId]);

      // Check each available slot for conflicts and remove conflicting ones
      let removedSlots = 0;

      for (const slot of availableSlots) {
        let hasConflict = false;

        // Check for booking conflicts
        for (const booking of bookings) {
          const slotStart = new Date(slot.start_datetime).getTime();
          const slotEnd = new Date(slot.end_datetime).getTime();
          const bookingStart = new Date(booking.start_datetime).getTime();
          const bookingEnd = new Date(booking.end_datetime).getTime();

          // Check if times overlap
          if (slotStart < bookingEnd && slotEnd > bookingStart) {
            hasConflict = true;
            break;
          }
        }

        // Check for blocked date conflicts if no booking conflict
        if (!hasConflict) {
          for (const blocked of blockedDates) {
            const slotStart = new Date(slot.start_datetime).getTime();
            const slotEnd = new Date(slot.end_datetime).getTime();
            const blockedStart = new Date(blocked.start_datetime).getTime();
            const blockedEnd = new Date(blocked.end_datetime).getTime();

            // Check if times overlap
            if (slotStart < blockedEnd && slotEnd > blockedStart) {
              hasConflict = true;
              break;
            }
          }
        }

        // Remove conflicting slot
        if (hasConflict) {
          await connection.query('DELETE FROM available_slots WHERE id = ?', [slot.id]);
          removedSlots++;
        }
      }

      // Commit the transaction
      await connection.commit();

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('❌ Error cleaning up available slots:', error);
    throw error;
  }
};

/**
 * Get available time slots for a listing within a date range
 * Always returns slots from the available_slots table after synchronization
 * @param {number} listingId - The listing ID
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {Object} options - Additional options
 * @returns {Promise<Array>} Array of available time slots
 */
const getAvailableSlots = async (listingId, startDate, endDate, options = {}) => {
  try {

    // Get listing details to determine default slot duration and booking type
    const [listing] = await db.query(
      'SELECT booking_type, slot_duration FROM listings WHERE id = ?',
      [listingId]
    );

    if (!listing) {
      throw new Error('Listing not found');
    }

    // Convert dates to datetime format for comparison
    const startDateTime = `${startDate} 00:00:00`;
    const endDateTime = `${endDate} 23:59:59`;

    // Get all base available slots from the available_slots table
    const baseSlots = await db.query(`
      SELECT * FROM available_slots
      WHERE listing_id = ?
      AND start_datetime < ?
      AND end_datetime > ?
      AND is_available = TRUE
      ORDER BY start_datetime ASC
    `, [listingId, endDateTime, startDateTime]);

    if (baseSlots.length === 0) {
      return [];
    }

    // Get all confirmed, pending, and completed bookings for this listing in the date range
    const bookings = await db.query(`
      SELECT id, start_datetime, end_datetime, status
      FROM bookings 
      WHERE listing_id = ? 
      AND status IN ('pending', 'confirmed', 'completed')
      AND start_datetime < ?
      AND end_datetime > ?
    `, [listingId, endDateTime, startDateTime]);

    // Get all blocked dates for this listing in the date range
    const blockedDates = await db.query(`
      SELECT id, start_datetime, end_datetime
      FROM blocked_dates 
      WHERE listing_id = ?
      AND start_datetime < ?
      AND end_datetime > ?
    `, [listingId, endDateTime, startDateTime]);

    // Convert base slots to timestamp format for splitting algorithm
    const slotsWithTimestamps = baseSlots.map(slot => ({
      ...slot,
      start: new Date(slot.start_datetime).getTime(),
      end: new Date(slot.end_datetime).getTime()
    }));

    // Convert reservations to timestamp format
    const allReservations = [
      ...bookings.map(b => ({
        id: `booking_${b.id}`,
        start: new Date(b.start_datetime).getTime(),
        end: new Date(b.end_datetime).getTime(),
        type: 'booking'
      })),
      ...blockedDates.map(bd => ({
        id: `blocked_${bd.id}`,
        start: new Date(bd.start_datetime).getTime(),
        end: new Date(bd.end_datetime).getTime(),
        type: 'blocked'
      }))
    ];

    // Apply slot splitting logic
    const splitSlots = subtractReservationsFromSlots(slotsWithTimestamps, allReservations);

    // Convert back to datetime format and return
    return splitSlots.map(slot => ({
      id: slot.id,
      listing_id: slot.listing_id,
      start_datetime: toMySQLDateTime(new Date(slot.start)),
      end_datetime: toMySQLDateTime(new Date(slot.end)),
      slot_type: slot.slot_type || 'split',
      price_override: slot.price_override,
      booking_type: slot.booking_type || listing.booking_type,
      slot_duration: slot.slot_duration || listing.slot_duration || DEFAULT_SLOT_DURATION
    }));
  } catch (error) {
    console.error('❌ Error getting available slots:', error);
    throw error;
  }
};

/**
 * Get available time slots for public users with hour unit_type duration slicing
 * @param {number} listingId - The listing ID
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {Object} options - Additional options
 * @returns {Promise<Array>} Array of available time slots
 */
const getPublicAvailableSlots = async (listingId, startDate, endDate, options = {}) => {
  try {

    // Get listing details including unit_type and slot_duration
    const [listing] = await db.query(
      'SELECT booking_type, slot_duration, unit_type FROM listings WHERE id = ?',
      [listingId]
    );

    if (!listing) {
      throw new Error('Listing not found');
    }

    // Convert dates to datetime format for comparison
    const startDateTime = `${startDate} 00:00:00`;
    const endDateTime = `${endDate} 23:59:59`;

    // Get available slots directly from the available_slots table
    const availableSlots = await db.query(`
      SELECT * FROM available_slots
      WHERE listing_id = ?
      AND start_datetime < ?
      AND end_datetime > ?
      AND is_available = TRUE
      ORDER BY start_datetime ASC
    `, [listingId, endDateTime, startDateTime]);

    if (availableSlots.length === 0) {
      return [];
    }

    // Get all confirmed, pending, and completed reservations for this listing in the date range
    const reservations = await db.query(`
      SELECT id, start_datetime, end_datetime, status
      FROM bookings 
      WHERE listing_id = ? 
      AND status IN ('pending', 'confirmed', 'completed')
      AND start_datetime < ?
      AND end_datetime > ?
    `, [listingId, endDateTime, startDateTime]);

    // Get all blocked ranges for this listing in the date range
    const blockedRanges = await db.query(`
      SELECT id, start_datetime, end_datetime
      FROM blocked_ranges 
      WHERE listing_id = ?
      AND start_datetime < ?
      AND end_datetime > ?
    `, [listingId, endDateTime, startDateTime]);

    // Handle hour unit_type with slot_duration slicing
    if (listing.unit_type === 'hour' || listing.unit_type === 'appointment') {
      // Get the actual slot duration in minutes from the listing
      // Make sure we're using the actual duration value, not defaulting to 60
      const slotDurationMinutes = parseInt(listing.slot_duration) || 180; // Default to 3 hours if not set
      const durationMs = slotDurationMinutes * 60 * 1000; // Convert minutes to milliseconds

      const hourlySlots = [];

      // Process each available slot
      for (const slot of availableSlots) {
        // Convert to timestamp ranges for easier manipulation
        let availableRanges = [{
          start: new Date(slot.start_datetime).getTime(),
          end: new Date(slot.end_datetime).getTime(),
          id: slot.id
        }];

        // Subtract overlapping reservations
        for (const reservation of reservations) {
          const resStart = new Date(reservation.start_datetime).getTime();
          const resEnd = new Date(reservation.end_datetime).getTime();

          availableRanges = subtractTimeRange(availableRanges, resStart, resEnd);
        }

        // Subtract overlapping blocked ranges
        for (const blocked of blockedRanges) {
          const blockStart = new Date(blocked.start_datetime).getTime();
          const blockEnd = new Date(blocked.end_datetime).getTime();

          availableRanges = subtractTimeRange(availableRanges, blockStart, blockEnd);
        }

        // Slice remaining ranges into consecutive slots sized by the actual slot_duration
        for (const range of availableRanges) {
          let slotStart = range.start;
          let slotIndex = 0;

          // Check if this range is valid (at least as long as one slot duration)
          if (range.end - range.start < durationMs) {
            continue; // Skip ranges that are too short for a full slot
          }

          while (slotStart + durationMs <= range.end) {
            const slotEnd = slotStart + durationMs;
            const dateStr = new Date(slotStart).toISOString().split('T')[0];

            // Generate a unique ID using the timestamp to avoid duplicates
            hourlySlots.push({
              id: `${slot.id}_${dateStr}_${slotIndex}_${slotStart}`,
              listing_id: listingId,
              start_datetime: toMySQLDateTime(new Date(slotStart)),
              end_datetime: toMySQLDateTime(new Date(slotEnd)),
              slot_type: 'hourly',
              price_override: slot.price_override,
              booking_type: listing.booking_type || 'hourly',
              slot_duration: slotDurationMinutes // Use the actual duration in minutes
            });

            slotStart = slotEnd;
            slotIndex++;
          }
        }
      }

      return hourlySlots.sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));
    }

    // For non-hour unit types, fall back to original logic
    // We already have the available slots from the query above
    const baseSlots = availableSlots;

    // Convert base slots to timestamp format for splitting algorithm
    const slotsWithTimestamps = baseSlots.map(slot => ({
      ...slot,
      start: new Date(slot.start_datetime).getTime(),
      end: new Date(slot.end_datetime).getTime()
    }));

    // Convert reservations to timestamp format
    const allReservations = [
      ...reservations.map(r => ({
        id: `reservation_${r.id}`,
        start: new Date(r.start_datetime).getTime(),
        end: new Date(r.end_datetime).getTime(),
        type: 'reservation'
      })),
      ...blockedRanges.map(br => ({
        id: `blocked_${br.id}`,
        start: new Date(br.start_datetime).getTime(),
        end: new Date(br.end_datetime).getTime(),
        type: 'blocked'
      }))
    ];

    // Apply slot splitting logic
    const splitSlots = subtractReservationsFromSlots(slotsWithTimestamps, allReservations);

    // Convert back to datetime format and return
    return splitSlots.map(slot => ({
      id: slot.id,
      listing_id: slot.listing_id,
      start_datetime: toMySQLDateTime(new Date(slot.start)),
      end_datetime: toMySQLDateTime(new Date(slot.end)),
      slot_type: slot.slot_type || 'split',
      price_override: slot.price_override,
      booking_type: slot.booking_type || listing.booking_type,
      slot_duration: slot.slot_duration || listing.slot_duration || DEFAULT_SLOT_DURATION
    }));
  } catch (error) {
    console.error('❌ Error getting public available slots:', error);
    throw error;
  }
};

/**
 * Helper function to subtract a time range from an array of available ranges
 * @param {Array} ranges - Array of {start, end} time ranges
 * @param {number} subtractStart - Start timestamp to subtract
 * @param {number} subtractEnd - End timestamp to subtract
 * @returns {Array} Updated array of available ranges
 */
const subtractTimeRange = (ranges, subtractStart, subtractEnd) => {
  const result = [];

  for (const range of ranges) {
    // No overlap
    if (subtractEnd <= range.start || subtractStart >= range.end) {
      result.push(range);
      continue;
    }

    // Partial overlap - keep the parts that don't overlap
    if (subtractStart > range.start) {
      result.push({
        start: range.start,
        end: Math.min(subtractStart, range.end),
        id: range.id // Preserve the id from the original range
      });
    }

    if (subtractEnd < range.end) {
      result.push({
        start: Math.max(subtractEnd, range.start),
        end: range.end,
        id: range.id // Preserve the id from the original range
      });
    }

  }

  return result;
};

/**
 * Host Controller
 * Handles HTTP requests for host operations
 */
const hostController = {
  /**
   * Get host profile
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getProfile(req, res, next) {
    try {
      const userId = req.params.userId || req.user.id;

      // Get host profile
      const [hostProfile] = await db.query(`
        SELECT hp.*, u.name, u.email, u.phone, u.profile_image,
          (SELECT COUNT(*) FROM listings WHERE user_id = hp.user_id AND active = 1) as listing_count,
          (SELECT AVG(r.rating) FROM reviews r 
           JOIN listings l ON r.listing_id = l.id 
           WHERE l.user_id = hp.user_id) as avg_rating,
          (SELECT COUNT(*) FROM reviews r 
           JOIN listings l ON r.listing_id = l.id 
           WHERE l.user_id = hp.user_id) as review_count
        FROM host_profiles hp
        JOIN users u ON hp.user_id = u.id
        WHERE hp.user_id = ?
      `, [userId]);

      if (!hostProfile) {
        // If no host profile exists, get basic user info
        const [user] = await db.query(`
          SELECT id, name, email, phone, profile_image, created_at
          FROM users 
          WHERE id = ?
        `, [userId]);

        if (!user) {
          return res.status(404).json({
            status: 'error',
            message: 'User not found'
          });
        }

        return res.status(200).json({
          status: 'success',
          data: {
            ...user,
            listing_count: 0,
            avg_rating: 0,
            review_count: 0,
            is_host_profile_created: false
          }
        });
      }

      // Get host listings
      const listings = await db.query(`
        SELECT l.id, l.title, l.price_per_hour, l.price_per_day, l.location, l.rating, l.review_count,
          (SELECT image_url FROM listing_photos WHERE listing_id = l.id AND is_cover = 1 LIMIT 1) as cover_photo
        FROM listings l
        WHERE l.user_id = ? AND l.active = 1
        ORDER BY l.created_at DESC
        LIMIT 5
      `, [userId]);

      // Get host reviews
      const reviews = await db.query(`
        SELECT r.*, l.id as listing_id, l.title as listing_title,
          u.name as reviewer_name, u.profile_image as reviewer_image
        FROM reviews r
        JOIN listings l ON r.listing_id = l.id
        JOIN users u ON r.reviewer_id = u.id
        WHERE l.user_id = ?
        ORDER BY r.created_at DESC
        LIMIT 5
      `, [userId]);

      res.status(200).json({
        status: 'success',
        data: {
          ...hostProfile,
          listings,
          reviews,
          is_host_profile_created: true
        }
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },

  /**
   * Create or update host profile
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updateProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const profileData = req.body;

      // Check if host profile exists
      const [existingProfile] = await db.query(
        'SELECT * FROM host_profiles WHERE user_id = ?',
        [userId]
      );

      if (existingProfile) {
        // Update existing profile
        await db.query(
          'UPDATE host_profiles SET ? WHERE user_id = ?',
          [profileData, userId]
        );
      } else {
        // Create new profile
        await db.query(
          'INSERT INTO host_profiles SET ?',
          [{ ...profileData, user_id: userId, joined_date: new Date() }]
        );
      }

      // Get updated profile
      const [updatedProfile] = await db.query(`
        SELECT hp.*, u.name, u.email, u.phone, u.profile_image
        FROM host_profiles hp
        JOIN users u ON hp.user_id = u.id
        WHERE hp.user_id = ?
      `, [userId]);

      res.status(200).json({
        status: 'success',
        data: updatedProfile
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },

  /**
   * Get host qualifications
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getQualifications(req, res, next) {
    try {
      const userId = req.params.userId || req.user.id;

      const qualifications = await db.query(
        'SELECT * FROM provider_qualifications WHERE user_id = ? ORDER BY issue_date DESC',
        [userId]
      );

      res.status(200).json({
        status: 'success',
        results: qualifications.length,
        data: qualifications
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },

  /**
   * Add qualification
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async addQualification(req, res, next) {
    try {
      const userId = req.user.id;
      const qualificationData = {
        ...req.body,
        user_id: userId
      };

      const result = await db.insert('provider_qualifications', qualificationData);

      const [qualification] = await db.query(
        'SELECT * FROM provider_qualifications WHERE id = ?',
        [result.insertId]
      );

      res.status(201).json({
        status: 'success',
        data: qualification
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },

  /**
   * Update qualification
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updateQualification(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Check if qualification exists and belongs to user
      const [qualification] = await db.query(
        'SELECT * FROM provider_qualifications WHERE id = ?',
        [id]
      );

      if (!qualification) {
        return res.status(404).json({
          status: 'error',
          message: 'Qualification not found'
        });
      }

      if (qualification.user_id !== userId) {
        return res.status(403).json({
          status: 'error',
          message: 'You are not authorized to update this qualification'
        });
      }

      // Update qualification
      await db.update('provider_qualifications', id, req.body);

      // Get updated qualification
      const [updatedQualification] = await db.query(
        'SELECT * FROM provider_qualifications WHERE id = ?',
        [id]
      );

      res.status(200).json({
        status: 'success',
        data: updatedQualification
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },

  /**
   * Delete qualification
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async deleteQualification(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Check if qualification exists and belongs to user
      const [qualification] = await db.query(
        'SELECT * FROM provider_qualifications WHERE id = ?',
        [id]
      );

      if (!qualification) {
        return res.status(404).json({
          status: 'error',
          message: 'Qualification not found'
        });
      }

      if (qualification.user_id !== userId) {
        return res.status(403).json({
          status: 'error',
          message: 'You are not authorized to delete this qualification'
        });
      }

      // Delete qualification
      await db.remove('provider_qualifications', id);

      res.status(204).end();
    } catch (error) {
      next(errorHandler(error));
    }
  },

  /**
   * Get portfolio items
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getPortfolio(req, res, next) {
    try {
      const userId = req.params.userId || req.user.id;

      const portfolio = await db.query(
        'SELECT * FROM provider_portfolio WHERE user_id = ? ORDER BY sort_order ASC',
        [userId]
      );

      res.status(200).json({
        status: 'success',
        results: portfolio.length,
        data: portfolio
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },

  /**
   * Add portfolio item
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async addPortfolioItem(req, res, next) {
    try {
      const userId = req.user.id;

      // Handle file upload if present
      let imageUrl = null;
      if (req.file) {
        try {
          // Upload to Cloudinary
          const cloudinaryResult = await uploadToCloudinary(req.file.path);
          imageUrl = cloudinaryResult.secure_url;
        } catch (uploadError) {
          console.error('Error uploading portfolio image:', uploadError);
          // Delete the local file if upload failed
          if (req.file.path && require('fs').existsSync(req.file.path)) {
            require('fs').unlinkSync(req.file.path);
          }
          return next(badRequest('Failed to upload portfolio image'));
        }
      } else if (!req.body.image_url) {
        return res.status(400).json({
          status: 'error',
          message: 'Image is required'
        });
      } else {
        imageUrl = req.body.image_url;
      }

      // Get max sort order
      const [maxSortResult] = await db.query(
        'SELECT MAX(sort_order) as max_sort FROM provider_portfolio WHERE user_id = ?',
        [userId]
      );

      const nextSortOrder = (maxSortResult.max_sort || 0) + 1;

      const portfolioData = {
        user_id: userId,
        title: req.body.title,
        description: req.body.description,
        image_url: imageUrl,
        sort_order: nextSortOrder
      };

      const result = await db.insert('provider_portfolio', portfolioData);

      const [portfolioItem] = await db.query(
        'SELECT * FROM provider_portfolio WHERE id = ?',
        [result.insertId]
      );

      res.status(201).json({
        status: 'success',
        data: portfolioItem
      });
    } catch (error) {
      // Delete uploaded file if there was an error
      if (req.file && req.file.path && require('fs').existsSync(req.file.path)) {
        require('fs').unlinkSync(req.file.path);
      }
      next(errorHandler(error));
    }
  },

  /**
   * Update portfolio item
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updatePortfolioItem(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Check if portfolio item exists and belongs to user
      const [portfolioItem] = await db.query(
        'SELECT * FROM provider_portfolio WHERE id = ?',
        [id]
      );

      if (!portfolioItem) {
        return res.status(404).json({
          status: 'error',
          message: 'Portfolio item not found'
        });
      }

      if (portfolioItem.user_id !== userId) {
        return res.status(403).json({
          status: 'error',
          message: 'You are not authorized to update this portfolio item'
        });
      }

      const updateData = { ...req.body };

      // Handle file upload if present
      if (req.file) {
        try {
          // Upload to Cloudinary
          const cloudinaryResult = await uploadToCloudinary(req.file.path);
          updateData.image_url = cloudinaryResult.secure_url;

          // Delete old image from Cloudinary
          if (portfolioItem.image_url && portfolioItem.image_url.includes('cloudinary.com')) {
            // Extract public_id from Cloudinary URL and delete
            const urlParts = portfolioItem.image_url.split('/');
            const filenamePart = urlParts[urlParts.length - 1];
            const filename = filenamePart.split('.')[0]; // Remove extension
            const publicId = `${process.env.CLOUDINARY_FOLDER || 'reserve-app'}/${filename}`;
            await deleteFile(publicId);
          }
        } catch (uploadError) {
          console.error('Error uploading portfolio image:', uploadError);
          // Delete the local file if upload failed
          if (req.file.path && require('fs').existsSync(req.file.path)) {
            require('fs').unlinkSync(req.file.path);
          }
          return next(badRequest('Failed to upload portfolio image'));
        }
      }

      // Update portfolio item
      await db.update('provider_portfolio', id, updateData);

      // Get updated portfolio item
      const [updatedItem] = await db.query(
        'SELECT * FROM provider_portfolio WHERE id = ?',
        [id]
      );

      res.status(200).json({
        status: 'success',
        data: updatedItem
      });
    } catch (error) {
      // Delete uploaded file if there was an error
      if (req.file && req.file.path && require('fs').existsSync(req.file.path)) {
        require('fs').unlinkSync(req.file.path);
      }
      next(errorHandler(error));
    }
  },

  /**
   * Delete portfolio item
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async deletePortfolioItem(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Check if portfolio item exists and belongs to user
      const [portfolioItem] = await db.query(
        'SELECT * FROM provider_portfolio WHERE id = ?',
        [id]
      );

      if (!portfolioItem) {
        return res.status(404).json({
          status: 'error',
          message: 'Portfolio item not found'
        });
      }

      if (portfolioItem.user_id !== userId) {
        return res.status(403).json({
          status: 'error',
          message: 'You are not authorized to delete this portfolio item'
        });
      }

      // Delete portfolio item
      await db.remove('provider_portfolio', id);

      // Delete image file
      if (portfolioItem.image_url) {
        const filename = portfolioItem.image_url.split('/').pop();
        deleteFile(filename);
      }

      res.status(204).end();
    } catch (error) {
      next(errorHandler(error));
    }
  },

  /**
   * Update portfolio item order
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updatePortfolioOrder(req, res, next) {
    try {
      const userId = req.user.id;
      const { items } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid items array'
        });
      }

      // Start a transaction
      const connection = await db.getPool().getConnection();
      await connection.beginTransaction();

      try {
        // Update each item's sort order
        for (let i = 0; i < items.length; i++) {
          const { id, sort_order } = items[i];

          // Check if item belongs to user
          const [item] = await connection.query(
            'SELECT * FROM provider_portfolio WHERE id = ? AND user_id = ?',
            [id, userId]
          );

          if (!item) {
            throw badRequest(`Portfolio item with ID ${id} not found or doesn't belong to you`);
          }

          // Update sort order
          await connection.query(
            'UPDATE provider_portfolio SET sort_order = ? WHERE id = ?',
            [sort_order || i, id]
          );
        }

        await connection.commit();

        // Get updated portfolio
        const portfolio = await db.query(
          'SELECT * FROM provider_portfolio WHERE user_id = ? ORDER BY sort_order ASC',
          [userId]
        );

        res.status(200).json({
          status: 'success',
          data: portfolio
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      next(errorHandler(error));
    }
  },

  /**
        }
      } catch (uploadError) {
        console.error('Error uploading portfolio image:', uploadError);
        // Delete the local file if upload failed
        if (req.file.path && require('fs').existsSync(req.file.path)) {
          require('fs').unlinkSync(req.file.path);
          primary_image: booking.primary_image
        },
        guest: {
          id: booking.guest_id,
          name: booking.guest_name,
          profile_image: booking.guest_profile_image
        }
      }));
      
      res.status(200).json({
        status: 'success',
        results: formattedReservations.length,
        data: formattedReservations
      });
    } catch (error) {
      console.error('Error getting upcoming reservations:', error);
      next(errorHandler(error));
    }
  },

  /**
   * Debug endpoint to check for bookings directly
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async debugBookings(req, res, next) {
    try {
      const userId = req.user.id;

      // Get all listings for this host
      const listings = await db.query(`
        SELECT id, title FROM listings WHERE user_id = ?
      `, [userId]);

      if (listings.length === 0) {
        return res.status(200).json({
          status: 'success',
          message: 'No listings found for this host',
          data: { listings: [], bookings: [] }
        });
      }

      const listingIds = listings.map(listing => listing.id);

      // Get all bookings for these listings
      const bookings = await db.query(`
        SELECT b.*, l.title as listing_title, u.name as guest_name
        FROM bookings b
        JOIN listings l ON b.listing_id = l.id
        JOIN users u ON b.user_id = u.id
        WHERE l.user_id = ?
        ORDER BY b.created_at DESC
        LIMIT 50
      `, [userId]);

      res.status(200).json({
        status: 'success',
        data: {
          listings,
          bookings,
          user_id: userId
        }
      });
    } catch (error) {
      console.error('Error in debug bookings:', error);
      next(errorHandler(error));
    }
  },

  /**
   * Get all listings for the current host
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getHostListings(req, res, next) {
    try {

      if (!req.user) {
        console.error('req.user is undefined in getHostListings');
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      const userId = req.user.id;

      const isDoctorListing = req.query.is_doctor_listing === 'true';

      let query = `
        SELECT l.id, l.title, l.price_per_hour, l.price_per_day, l.location, l.rating, l.review_count,
          (SELECT image_url FROM listing_photos WHERE listing_id = l.id AND is_cover = 1 LIMIT 1) as primary_image
        FROM listings l
        WHERE l.user_id = ?`;

      const queryParams = [userId];

      if (req.query.is_doctor_listing !== undefined) {
        query += ` AND l.is_doctor_listing = ?`;
        queryParams.push(isDoctorListing ? 1 : 0);
      }

      query += ` ORDER BY l.created_at DESC`;

      const listings = await db.query(query, queryParams);

      res.status(200).json({
        status: 'success',
        results: listings.length,
        data: listings
      });
    } catch (error) {
      console.error('Error getting host listings:', error);
      next(errorHandler(error));
    }
  },

  /**
   * Get all reservations for a specific listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getListingReservations(req, res, next) {
    try {
      const userId = req.user.id;
      const { listingId } = req.params;

      // Check if listing exists and belongs to user
      const [listing] = await db.query(
        'SELECT * FROM listings WHERE id = ? AND user_id = ?',
        [listingId, userId]
      );

      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found or not owned by you'
        });
      }

      // Get reservations with DISTINCT to prevent duplicates
      const reservations = await db.query(`
        SELECT DISTINCT b.id, b.start_datetime as check_in_date, b.end_datetime as check_out_date, 
               b.status, b.guests_count as guests, b.total_price, b.created_at,
               u.id as guest_id, u.name as guest_name, u.profile_image as guest_profile_image
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        WHERE b.listing_id = ? 
        AND b.status IN ('pending', 'confirmed', 'completed')
        ORDER BY b.start_datetime ASC
      `, [listingId]);

      // Format data for frontend - use consistent datetime format like available slots
      const formattedReservations = reservations.map(booking => {
        // Convert to consistent MySQL datetime format without timezone issues
        let startDate, endDate;

        if (booking.check_in_date instanceof Date) {
          startDate = toMySQLDateTime(booking.check_in_date).replace(' ', 'T');
        } else {
          // Convert MySQL datetime format to ISO format without Z suffix
          startDate = typeof booking.check_in_date === 'string' ?
            booking.check_in_date.replace(' ', 'T').replace('Z', '') : booking.check_in_date;
        }

        if (booking.check_out_date instanceof Date) {
          endDate = toMySQLDateTime(booking.check_out_date).replace(' ', 'T');
        } else {
          // Convert MySQL datetime format to ISO format without Z suffix
          endDate = typeof booking.check_out_date === 'string' ?
            booking.check_out_date.replace(' ', 'T').replace('Z', '') : booking.check_out_date;
        }

        return {
          id: booking.id,
          type: 'reservation',
          start_datetime: startDate.replace('T', ' '),
          end_datetime: endDate.replace('T', ' '),
          status: booking.status,
          guests: booking.guests,
          totalPrice: booking.total_price,
          guest: {
            id: booking.guest_id,
            name: booking.guest_name,
            profile_image: booking.guest_profile_image
          }
        };
      });

      res.status(200).json({
        status: 'success',
        results: formattedReservations.length,
        data: formattedReservations
      });
    } catch (error) {
      console.error('Error getting listing reservations:', error);
      next(errorHandler(error));
    }
  },

  /**
   * Get all blocked dates for a specific listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getListingBlockedDates(req, res, next) {
    try {
      const userId = req.user.id;
      const { listingId } = req.params;

      // Check if listing exists and belongs to user
      const [listing] = await db.query(
        'SELECT * FROM listings WHERE id = ? AND user_id = ?',
        [listingId, userId]
      );

      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found or not owned by you'
        });
      }

      // Get blocked dates
      const blockedDates = await db.query(
        'SELECT * FROM blocked_dates WHERE listing_id = ? ORDER BY start_datetime ASC',
        [listingId]
      );

      // Format data for frontend - consistent with other date handling
      const formattedBlockedDates = blockedDates.map(blockedDate => {
        try {
          // Extract date and time parts from start_datetime and end_datetime
          let startDateTime, endDateTime;

          if (blockedDate.start_datetime) {
            if (typeof blockedDate.start_datetime === 'string' && blockedDate.start_datetime.includes('T')) {
              // Remove timezone info if present and keep just YYYY-MM-DDTHH:MM:SS format
              startDateTime = blockedDate.start_datetime.split('.')[0].replace('Z', '');
            } else if (blockedDate.start_datetime instanceof Date) {
              // For Date objects, format without timezone
              const year = blockedDate.start_datetime.getFullYear();
              const month = String(blockedDate.start_datetime.getMonth() + 1).padStart(2, '0');
              const day = String(blockedDate.start_datetime.getDate()).padStart(2, '0');
              const hours = String(blockedDate.start_datetime.getHours()).padStart(2, '0');
              const minutes = String(blockedDate.start_datetime.getMinutes()).padStart(2, '0');
              const seconds = String(blockedDate.start_datetime.getSeconds()).padStart(2, '0');
              startDateTime = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
            } else {
              startDateTime = blockedDate.start_datetime;
            }
          }

          if (blockedDate.end_datetime) {
            if (typeof blockedDate.end_datetime === 'string' && blockedDate.end_datetime.includes('T')) {
              // Remove timezone info if present and keep just YYYY-MM-DDTHH:MM:SS format
              endDateTime = blockedDate.end_datetime.split('.')[0].replace('Z', '');
            } else if (blockedDate.end_datetime instanceof Date) {
              // For Date objects, format without timezone
              const year = blockedDate.end_datetime.getFullYear();
              const month = String(blockedDate.end_datetime.getMonth() + 1).padStart(2, '0');
              const day = String(blockedDate.end_datetime.getDate()).padStart(2, '0');
              const hours = String(blockedDate.end_datetime.getHours()).padStart(2, '0');
              const minutes = String(blockedDate.end_datetime.getMinutes()).padStart(2, '0');
              const seconds = String(blockedDate.end_datetime.getSeconds()).padStart(2, '0');
              endDateTime = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
            } else {
              endDateTime = blockedDate.end_datetime;
            }
          }

          return {
            id: blockedDate.id,
            type: 'blocked',
            startDate: startDateTime,
            endDate: endDateTime,
            reason: blockedDate.reason || ''
          };
        } catch (err) {
          console.error('Error formatting blocked date:', err, 'for record:', blockedDate);
          return {
            id: blockedDate.id,
            type: 'blocked',
            startDate: null,
            endDate: null,
            reason: blockedDate.reason || 'Error parsing date/time'
          };
        }
      });

      res.status(200).json({
        status: 'success',
        results: formattedBlockedDates.length,
        data: formattedBlockedDates
      });
    } catch (error) {
      console.error('Error getting blocked dates:', error);
      next(errorHandler(error));
    }
  },

  /**
   * Block dates for a specific listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async addListingBlockedDates(req, res, next) {
    try {

      // Store listingId for later use with cleanupAvailableSlots

      const userId = req.user.id;
      const { listingId } = req.params;
      const { start_date, end_date, start_datetime, end_datetime, reason, is_overnight, primary_date } = req.body;

      // Check if listing exists and belongs to user
      const [listing] = await db.query(
        'SELECT * FROM listings WHERE id = ? AND user_id = ?',
        [listingId, userId]
      );

      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found or not owned by you'
        });
      }

      // Get availability mode for this listing
      const [listingSettings] = await db.query(
        'SELECT availability_mode FROM listing_settings WHERE listing_id = ?',
        [listingId]
      );

      const availabilityMode = listingSettings?.availability_mode || 'available-by-default';

      // Handle both datetime and date formats from frontend
      let normalizedStartDate, normalizedEndDate;

      // Determine which format is being sent
      const useDateTime = start_datetime && end_datetime;
      const actualStartDate = useDateTime ? start_datetime : start_date;
      const actualEndDate = useDateTime ? end_datetime : end_date;

      try {
        // Handle start_date/start_datetime
        if (!actualStartDate || typeof actualStartDate !== 'string') {
          return res.status(400).json({
            status: 'error',
            message: 'Invalid start date format'
          });
        }

        // Normalize actualStartDate to YYYY-MM-DD format
        if (/^\d{4}-\d{2}-\d{2}$/.test(actualStartDate)) {
          normalizedStartDate = actualStartDate;
        } else if (actualStartDate.includes('T')) {
          normalizedStartDate = actualStartDate.split('T')[0];
        } else {
          const testDate = new Date(actualStartDate + 'T12:00:00');
          if (isNaN(testDate.getTime())) {
            return res.status(400).json({
              status: 'error',
              message: 'Invalid start date format'
            });
          }
          const year = testDate.getFullYear();
          const month = String(testDate.getMonth() + 1).padStart(2, '0');
          const day = String(testDate.getDate()).padStart(2, '0');
          normalizedStartDate = `${year}-${month}-${day}`;
        }

        // Handle end_date/end_datetime
        if (!actualEndDate || typeof actualEndDate !== 'string') {
          return res.status(400).json({
            status: 'error',
            message: 'Invalid end date format'
          });
        }

        // Normalize actualEndDate to YYYY-MM-DD format
        if (/^\d{4}-\d{2}-\d{2}$/.test(actualEndDate)) {
          normalizedEndDate = actualEndDate;
        } else if (actualEndDate.includes('T')) {
          normalizedEndDate = actualEndDate.split('T')[0];
        } else {
          const testDate = new Date(actualEndDate + 'T12:00:00');
          if (isNaN(testDate.getTime())) {
            return res.status(400).json({
              status: 'error',
              message: 'Invalid end date format'
            });
          }
          const year = testDate.getFullYear();
          const month = String(testDate.getMonth() + 1).padStart(2, '0');
          const day = String(testDate.getDate()).padStart(2, '0');
          normalizedEndDate = `${year}-${month}-${day}`;
        }

        // Allow any start/end date combination - no validation needed
      } catch (err) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid date format: ' + err.message
        });
      }

      // Handle time-specific blocking vs full-day blocking
      let startDateTime, endDateTime;

      // Check if start_date includes time information
      if (typeof start_date === 'string' && start_date.includes('T')) {
        // Time-specific blocking - use the provided datetime
        startDateTime = start_date.split('.')[0].replace('Z', '');
      } else {
        // Full-day blocking - start at beginning of day
        startDateTime = `${normalizedStartDate}T00:00:00`;
      }

      if (typeof end_date === 'string' && end_date.includes('T')) {
        // Time-specific blocking - use the provided datetime
        endDateTime = end_date.split('.')[0].replace('Z', '');
      } else {
        // Full-day blocking - end at end of day
        endDateTime = `${normalizedEndDate}T23:59:59`;
      }



      // Check for conflicts with existing bookings
      const bookings = await db.query(`
        SELECT * FROM bookings 
        WHERE listing_id = ? AND status IN ('pending', 'confirmed', 'completed')
        AND (
          (start_datetime <= ? AND end_datetime >= ?) OR
          (start_datetime <= ? AND end_datetime >= ?) OR
          (start_datetime >= ? AND end_datetime <= ?)
        )
      `, [listingId, startDateTime, startDateTime, endDateTime, endDateTime, startDateTime, endDateTime]);

      if (bookings.length > 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Cannot block dates that have existing bookings'
        });
      }

      // Check if we're blocking multiple days
      const startDateObj = new Date(normalizedStartDate + 'T12:00:00'); // Use noon to avoid timezone issues
      const endDateObj = new Date(normalizedEndDate + 'T12:00:00');
      const dayDiff = Math.floor((endDateObj.getTime() - startDateObj.getTime()) / (24 * 60 * 60 * 1000));

      // Check if this is a time-specific block within a single day
      const isTimeSpecificBlock = (typeof start_date === 'string' && start_date.includes('T')) ||
        (typeof end_date === 'string' && end_date.includes('T'));

      // If we're blocking multiple days AND it's not a datetime-based request, handle accordingly
      // Skip this logic if we have datetime fields (useDateTime = true) as those should go to the new logic
      if (dayDiff > 0 && !isTimeSpecificBlock && !useDateTime) {
        const blockedDates = [];

        // Start a transaction
        const connection = await db.getPool().getConnection();
        await connection.beginTransaction();

        try {
          // For each day in the range
          for (let i = 0; i <= dayDiff; i++) {
            // Calculate current date by adding days to start date
            const currentDateObj = new Date(startDateObj);
            currentDateObj.setDate(currentDateObj.getDate() + i);
            const year = currentDateObj.getFullYear();
            const month = String(currentDateObj.getMonth() + 1).padStart(2, '0');
            const day = String(currentDateObj.getDate()).padStart(2, '0');
            const currentDateStr = `${year}-${month}-${day}`;

            // Create datetime strings for this day
            const currentStartTime = `${currentDateStr}T00:00:00`;
            const currentEndTime = `${currentDateStr}T23:59:59`;

            // Add blocked date for this day
            const [result] = await connection.query(
              'INSERT INTO blocked_dates (listing_id, start_datetime, end_datetime, reason) VALUES (?, ?, ?, ?)',
              [listingId, currentStartTime, currentEndTime, reason || null]
            );

            // Get created blocked date
            const [blockedDate] = await connection.query(
              'SELECT * FROM blocked_dates WHERE id = ?',
              [result.insertId]
            );

            blockedDates.push({
              id: blockedDate.id,
              type: 'blocked',
              startDate: blockedDate.start_datetime,
              endDate: blockedDate.end_datetime,
              reason: blockedDate.reason || ''
            });
          }

          await connection.commit();

          // After successfully adding blocked dates, cleanup conflicting available slots
          try {
            await cleanupAvailableSlots(listingId);
          } catch (cleanupError) {
            console.error('Error cleaning up available slots after adding blocked dates:', cleanupError);
            // Don't fail the request if cleanup fails, but log the error
          }

          res.status(201).json({
            status: 'success',
            data: blockedDates
          });
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }
      } else if (availabilityMode === 'available-by-default') {

        if (useDateTime) {

          // Check if there's an existing blocked date that overlaps
          const [existingBlock] = await db.query(
            `SELECT * FROM blocked_dates 
             WHERE listing_id = ? 
             AND (
               (start_datetime <= ? AND end_datetime >= ?) OR
               (start_datetime <= ? AND end_datetime >= ?) OR
               (start_datetime >= ? AND end_datetime <= ?)
             )`,
            [listingId, actualStartDate, actualStartDate, actualEndDate, actualEndDate, actualStartDate, actualEndDate]
          );


          if (existingBlock) {
            // Update existing blocked date
            await db.query(
              'UPDATE blocked_dates SET start_datetime = ?, end_datetime = ?, reason = ?, is_overnight = ?, primary_date = ? WHERE id = ?',
              [actualStartDate, actualEndDate, reason || null, is_overnight || false, primary_date || null, existingBlock.id]
            );

            const responseData = {
              status: 'success',
              message: 'Blocked date updated successfully',
              data: {
                id: existingBlock.id,
                listing_id: listingId,
                start_datetime: actualStartDate,
                end_datetime: actualEndDate,
                reason: reason || null,
                is_overnight: is_overnight || false,
                primary_date: primary_date || null
              }
            };

            // After successfully updating blocked date, cleanup conflicting available slots
            try {
              await cleanupAvailableSlots(listingId);
            } catch (cleanupError) {
              console.error('Error cleaning up available slots after updating blocked date:', cleanupError);
              // Don't fail the request if cleanup fails, but log the error
            }

            res.status(201).json(responseData);
          } else {
            // Insert new blocked date record with exact datetime and overnight support
            const insertData = {
              listing_id: listingId,
              start_datetime: actualStartDate,
              end_datetime: actualEndDate,
              reason: reason || null,
              is_overnight: is_overnight || false,
              primary_date: primary_date || null
            };
            const result = await db.insert('blocked_dates', insertData);

            const responseData = {
              status: 'success',
              message: 'Blocked date added successfully',
              data: {
                id: result.insertId,
                listing_id: listingId,
                start_datetime: actualStartDate,
                end_datetime: actualEndDate,
                reason: reason || null,
                is_overnight: is_overnight || false,
                primary_date: primary_date || null
              }
            };
            // After successfully inserting blocked date, cleanup conflicting available slots
            try {
              await cleanupAvailableSlots(listingId);
            } catch (cleanupError) {
              console.error('Error cleaning up available slots after inserting blocked date:', cleanupError);
              // Don't fail the request if cleanup fails, but log the error
            }

            res.status(201).json(responseData);
          }
        } else {
          // Handle date-only blocking (full day blocking)
          const startDateObj = new Date(normalizedStartDate + 'T12:00:00');
          const endDateObj = new Date(normalizedEndDate + 'T12:00:00');
          const dayDiff = Math.floor((endDateObj.getTime() - startDateObj.getTime()) / (24 * 60 * 60 * 1000));

          if (dayDiff > 0) {
            // Multi-day blocking
            const connection = await db.getPool().getConnection();
            await connection.beginTransaction();

            try {
              const addedBlocks = [];

              for (let i = 0; i <= dayDiff; i++) {
                const currentDateObj = new Date(startDateObj);
                currentDateObj.setDate(currentDateObj.getDate() + i);
                const year = currentDateObj.getFullYear();
                const month = String(currentDateObj.getMonth() + 1).padStart(2, '0');
                const day = String(currentDateObj.getDate()).padStart(2, '0');
                const formattedDate = `${year}-${month}-${day}`;

                const startDateTime = `${formattedDate}T00:00:00`;
                const endDateTime = `${formattedDate}T23:59:59`;

                const [result] = await connection.query(
                  'INSERT INTO blocked_dates (listing_id, start_datetime, end_datetime, reason, is_overnight, primary_date) VALUES (?, ?, ?, ?, ?, ?)',
                  [listingId, startDateTime, endDateTime, reason || null, false, null]
                );

                addedBlocks.push({
                  id: result.insertId,
                  listing_id: listingId,
                  start_datetime: startDateTime,
                  end_datetime: endDateTime,
                  reason: reason || null
                });
              }

              await connection.commit();

              // After successfully adding blocked dates, cleanup conflicting available slots
              try {
                await cleanupAvailableSlots(listingId);
              } catch (cleanupError) {
                console.error('Error cleaning up available slots after adding blocked dates:', cleanupError);
                // Don't fail the request if cleanup fails, but log the error
              }

              res.status(201).json({
                status: 'success',
                data: addedBlocks
              });
            } catch (error) {
              await connection.rollback();
              throw error;
            } finally {
              connection.release();
            }
          } else {
            // Single day blocking
            const startDateTime = `${normalizedStartDate}T00:00:00`;
            const endDateTime = `${normalizedStartDate}T23:59:59`;

            const result = await db.insert('blocked_dates', {
              listing_id: listingId,
              start_datetime: startDateTime,
              end_datetime: endDateTime,
              reason: reason || null,
              is_overnight: false,
              primary_date: null
            });

            // After successfully adding blocked date, synchronize available slots
            try {
              await cleanupAvailableSlots(listingId);
            } catch (syncError) {
              console.error('Error synchronizing available slots after adding blocked date:', syncError);
              // Don't fail the request if synchronization fails, but log the error
            }

            res.status(201).json({
              status: 'success',
              message: 'Blocked date added successfully',
              data: {
                id: result.insertId,
                listing_id: listingId,
                start_datetime: startDateTime,
                end_datetime: endDateTime,
                reason: reason || null,
                is_overnight: false,
                primary_date: null
              }
            });
          }
        }
      } else if (availabilityMode === 'blocked-by-default') {
        // In blocked-by-default mode, blocking dates means removing availability entries
        if (useDateTime) {
          const startDate = actualStartDate.split('T')[0];
          const startTime = actualStartDate.split('T')[1] || '00:00:00';
          const endTime = actualEndDate.split('T')[1] || '23:59:59';

          await db.query(
            'DELETE FROM availability WHERE listing_id = ? AND date = ? AND start_time = ? AND end_time = ?',
            [listingId, startDate, startTime, endTime]
          );

          res.status(201).json({
            status: 'success',
            message: 'Date blocked successfully (availability removed)',
            data: {
              listing_id: listingId,
              date: startDate,
              start_time: startTime,
              end_time: endTime,
              action: 'availability_removed'
            }
          });
        } else {
          const startDateObj = new Date(normalizedStartDate + 'T12:00:00');
          const endDateObj = new Date(normalizedEndDate + 'T12:00:00');
          const dayDiff = Math.floor((endDateObj.getTime() - startDateObj.getTime()) / (24 * 60 * 60 * 1000));

          const removedDates = [];

          for (let i = 0; i <= dayDiff; i++) {
            const currentDateObj = new Date(startDateObj);
            currentDateObj.setDate(currentDateObj.getDate() + i);
            const year = currentDateObj.getFullYear();
            const month = String(currentDateObj.getMonth() + 1).padStart(2, '0');
            const day = String(currentDateObj.getDate()).padStart(2, '0');
            const currentDateStr = `${year}-${month}-${day}`;

            await db.query(
              'DELETE FROM availability WHERE listing_id = ? AND date = ?',
              [listingId, currentDateStr]
            );

            removedDates.push(currentDateStr);
          }

          res.status(201).json({
            status: 'success',
            message: 'Dates blocked successfully (availability removed)',
            data: {
              listing_id: listingId,
              blocked_dates: removedDates,
              action: 'availability_removed'
            }
          });
        }
      } else if (useDateTime) {
        // Handle datetime-based blocking (from calendar with specific times) in available-by-default mode
        const result = await db.insert('blocked_dates', {
          listing_id: listingId,
          start_datetime: actualStartDate,
          end_datetime: actualEndDate,
          reason: reason || null,
          is_overnight: is_overnight || false,
          primary_date: primary_date || null
        });

        // After successfully adding blocked date, synchronize available slots
        try {
          await cleanupAvailableSlots(listingId);
        } catch (syncError) {
          console.error('Error synchronizing available slots after adding blocked date:', syncError);
          // Don't fail the request if synchronization fails, but log the error
        }

        res.status(201).json({
          status: 'success',
          message: 'Blocked date added successfully',
          data: {
            id: result.insertId,
            listing_id: listingId,
            start_datetime: actualStartDate,
            end_datetime: actualEndDate,
            reason: reason || null,
            is_overnight: is_overnight || false,
            primary_date: primary_date || null
          }
        });
      } else {
        // Blocking a single day or time range within a day

        // Validate time range if it's time-specific
        if (isTimeSpecificBlock) {
          const startTime = new Date(startDateTime);
          const endTime = new Date(endDateTime);

          // Allow any start/end time combination - no validation needed

          // Check for overlapping blocked times on the same date
          const dateOnly = startDateTime.split('T')[0];
          const overlappingBlocks = await db.query(
            `SELECT * FROM blocked_dates 
             WHERE listing_id = ? 
             AND DATE(start_datetime) = ? 
             AND (
               (start_datetime <= ? AND end_datetime > ?) OR
               (start_datetime < ? AND end_datetime >= ?) OR
               (start_datetime >= ? AND end_datetime <= ?)
             )`,
            [listingId, dateOnly, startDateTime, startDateTime, endDateTime, endDateTime, startDateTime, endDateTime]
          );

          if (overlappingBlocks.length > 0) {
            return res.status(400).json({
              status: 'error',
              message: 'This time range overlaps with existing blocked times'
            });
          }
        }

        const result = await db.insert('blocked_dates', {
          listing_id: listingId,
          start_datetime: startDateTime,
          end_datetime: endDateTime,
          reason: reason || null
        });

        // Get created blocked date
        const [blockedDate] = await db.query(
          'SELECT * FROM blocked_dates WHERE id = ?',
          [result.insertId]
        );

        // After successfully adding blocked date, synchronize available slots
        try {
          await cleanupAvailableSlots(listingId);
        } catch (syncError) {
          console.error('Error synchronizing available slots after adding blocked date:', syncError);
          // Don't fail the request if synchronization fails, but log the error
        }

        res.status(201).json({
          status: 'success',
          data: {
            id: blockedDate.id,
            type: 'blocked',
            startDate: blockedDate.start_datetime,
            endDate: blockedDate.end_datetime,
            reason: blockedDate.reason || ''
          }
        });
      }
    } catch (error) {
      console.error('Error adding blocked dates:', error);
      next(errorHandler(error));
    }
  },

  /**
   * Delete a blocked date
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async deleteBlockedDate(req, res, next) {
    try {
      const userId = req.user.id;
      const { listingId, blockId } = req.params;

      // Check if listing exists and belongs to user
      const [listing] = await db.query(
        'SELECT * FROM listings WHERE id = ? AND user_id = ?',
        [listingId, userId]
      );

      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found or not owned by you'
        });
      }

      // Check if blocked date exists and belongs to the listing
      const [blockedDate] = await db.query(
        'SELECT * FROM blocked_dates WHERE id = ? AND listing_id = ?',
        [blockId, listingId]
      );

      if (!blockedDate) {
        return res.status(404).json({
          status: 'error',
          message: 'Blocked date not found for this listing'
        });
      }

      // Delete blocked date
      await db.query('DELETE FROM blocked_dates WHERE id = ?', [blockId]);

      res.status(200).json({
        status: 'success',
        message: 'Blocked date deleted successfully'
      });

      // After successfully deleting the blocked date, synchronize available slots
      try {
        await cleanupAvailableSlots(listingId);
      } catch (syncError) {
        console.error('Error synchronizing available slots after deleting blocked date:', syncError);
        // Don't fail the request if synchronization fails
      }
    } catch (error) {
      console.error('Error deleting blocked date:', error);
      next(errorHandler(error));
    }
  },

  /**
 * Add available slots directly to available_slots table
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
  async addAvailableSlots(req, res, next) {
    try {
      const userId = req.user.id;
      const { listingId } = req.params;
      const { start_datetime, end_datetime, slot_type, price_override, booking_type, slot_duration } = req.body;

      // Check if listing exists and belongs to user
      const [listing] = await db.query(
        'SELECT * FROM listings WHERE id = ? AND user_id = ?',
        [listingId, userId]
      );

      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found or not owned by you'
        });
      }

      // Validate required fields
      if (!start_datetime || !end_datetime) {
        return res.status(400).json({
          status: 'error',
          message: 'start_datetime and end_datetime are required'
        });
      }

      // Ensure the available_slots table exists
      await db.query(`
        CREATE TABLE IF NOT EXISTS available_slots (
          id INT AUTO_INCREMENT PRIMARY KEY,
          listing_id INT NOT NULL,
          start_datetime DATETIME NOT NULL,
          end_datetime DATETIME NOT NULL,
          slot_type ENUM('regular', 'generated', 'split', 'special') DEFAULT 'regular',
          price_override DECIMAL(10,2) NULL,
          booking_type ENUM('hourly', 'daily', 'night', 'appointment') NULL,
          slot_duration INT NULL,
          is_available BOOLEAN DEFAULT TRUE,
          original_availability_id INT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
          INDEX idx_listing_datetime (listing_id, start_datetime, end_datetime),
          INDEX idx_availability (listing_id, is_available),
          INDEX idx_slot_type (slot_type)
        )
      `);

      // Convert datetime strings to proper MySQL format without timezone conversion
      const startDate = start_datetime.includes('T') ? start_datetime.replace('T', ' ') : start_datetime;
      const endDate = end_datetime.includes('T') ? end_datetime.replace('T', ' ') : end_datetime;

      // Check for conflicts with existing bookings
      const conflictingBookings = await checkReservationConflicts(listingId, startDate, endDate);
      if (conflictingBookings.length > 0) {
        return res.status(409).json({
          status: 'error',
          message: 'Cannot add availability slot. There are existing bookings that conflict with this time slot.',
          conflicts: conflictingBookings
        });
      }

      // Check for conflicts with blocked dates
      const conflictingBlocked = await checkBlockedDateConflicts(listingId, startDate, endDate);
      if (conflictingBlocked.length > 0) {
        return res.status(409).json({
          status: 'error',
          message: 'Cannot add availability slot. There are blocked dates that conflict with this time slot.',
          conflicts: conflictingBlocked
        });
      }

      // Insert the available slot
      const result = await db.insert('available_slots', {
        listing_id: listingId,
        start_datetime: startDate,
        end_datetime: endDate,
        slot_type: slot_type || 'regular',
        price_override: price_override || null,
        booking_type: booking_type || null,
        slot_duration: slot_duration || null,
        is_available: true
      });

      // Get the created slot
      const [createdSlot] = await db.query(
        'SELECT * FROM available_slots WHERE id = ?',
        [result.insertId]
      );

      // Synchronize availability with other doctor listings
      try {
        let targetDoctorId = listing.doctor_user_id;
        // If it's a doctor profile, use the owner's ID
        if (!targetDoctorId && (listing.is_doctor_listing === 1 || listing.is_doctor_listing === true)) {
          targetDoctorId = listing.user_id;
        }

        if (targetDoctorId) {
          console.log(`Synchronizing availability for Doctor ID: ${targetDoctorId} from Listing ${listingId}`);

          // Find other listings associated with this doctor (Profile or Assigned Clinics)
          const otherListings = await db.query(
            'SELECT id, title FROM listings WHERE ((user_id = ? AND is_doctor_listing = 1) OR doctor_user_id = ?) AND id != ?',
            [targetDoctorId, targetDoctorId, listingId]
          );

          console.log(`Found ${otherListings.length} other listings to sync:`, otherListings.map(l => l.id));

          // Replicate slot to other listings
          for (const otherListing of otherListings) {
            // Check for conflicts in the target listing
            const conflicts = await checkReservationConflicts(otherListing.id, startDate, endDate);
            const blocked = await checkBlockedDateConflicts(otherListing.id, startDate, endDate);

            if (conflicts.length === 0 && blocked.length === 0) {
              await db.insert('available_slots', {
                listing_id: otherListing.id,
                start_datetime: startDate,
                end_datetime: endDate,
                slot_type: slot_type || 'regular',
                price_override: price_override || null,
                booking_type: booking_type || null,
                slot_duration: slot_duration || null,
                is_available: true
              });
              console.log(`Synced slot to Listing ${otherListing.id}`);
            } else {
              console.log(`Skipped sync to Listing ${otherListing.id} due to conflicts`);
            }
          }
        }
      } catch (syncError) {
        console.error('Error synchronizing doctor availability:', syncError);
        // Continue response even if sync fails
      }


      res.status(201).json({
        status: 'success',
        message: 'Available slot added successfully',
        data: createdSlot
      });

    } catch (error) {
      console.error('Error adding available slot:', error);
      next(errorHandler(error));
    }
  },

  /**
   * Delete available slot
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async deleteAvailableSlot(req, res, next) {
    try {
      const userId = req.user.id;
      const { listingId, slotId } = req.params;

      // Check if listing exists and belongs to user
      const [listing] = await db.query(
        'SELECT * FROM listings WHERE id = ? AND user_id = ?',
        [listingId, userId]
      );

      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found or not owned by you'
        });
      }

      // Handle split slots - extract original slot ID
      let actualSlotId = slotId;
      if (typeof slotId === 'string' && (slotId.includes('_split_') || slotId.includes('_full'))) {
        // Extract the original slot ID from split/full slot IDs
        // Format: "20_split_1" -> "20", "21_full" -> "21", "avail_11_split_1" -> "11"
        const parts = slotId.split('_');
        if (parts.length >= 2 && parts[0] === 'avail') {
          // Handle format: avail_11_split_1 or avail_9_full
          actualSlotId = parts[1];
        } else {
          // Handle format: 20_split_1 or 21_full (most common)
          actualSlotId = parts[0];
        }
      }

      // Check if slot exists and belongs to the listing
      const [slot] = await db.query(
        'SELECT * FROM available_slots WHERE id = ? AND listing_id = ?',
        [actualSlotId, listingId]
      );

      if (!slot) {
        return res.status(404).json({
          status: 'error',
          message: 'Available slot not found for this listing'
        });
      }

      // Check if this is a split slot that shouldn't be deleted
      // Split slots are identified by the slotId format, not the original slot's slot_type
      const isSplitSlot = slotId.includes('_split_');

      if (isSplitSlot) {
        return res.status(403).json({
          status: 'error',
          message: 'Cannot delete split slots. Split slots are auto-generated around reservations and cannot be manually deleted.'
        });
      }

      // Delete the original slot (this will affect all split versions of it)
      await db.query('DELETE FROM available_slots WHERE id = ?', [actualSlotId]);

      res.status(200).json({
        status: 'success',
        message: 'Available slot deleted successfully'
      });

    } catch (error) {
      console.error('Error deleting available slot:', error);
      next(errorHandler(error));
    }
  },

  /**
   * Get availability mode for a specific listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getListingAvailability(req, res, next) {
    try {
      const userId = req.user.id;
      const { listingId } = req.params;

      // Check if listing exists and belongs to user
      const [listing] = await db.query(
        'SELECT * FROM listings WHERE id = ? AND user_id = ?',
        [listingId, userId]
      );

      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found or not owned by you'
        });
      }

      // Get availability mode only
      const [availabilityMode] = await db.query(
        'SELECT availability_mode FROM listing_settings WHERE listing_id = ?',
        [listingId]
      );

      const mode = availabilityMode?.availability_mode || 'available-by-default';

      res.status(200).json({
        status: 'success',
        data: {
          mode
        }
      });
    } catch (error) {
      console.error('Error getting availability mode:', error);
      next(errorHandler(error));
    }
  },



  /**
   * Set availability mode for a specific listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async setAvailabilityMode(req, res, next) {
    try {
      const userId = req.user.id;
      const { listingId } = req.params;
      const { mode } = req.body;

      // Validate mode
      if (!['available-by-default', 'blocked-by-default'].includes(mode)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid availability mode. Must be "available-by-default" or "blocked-by-default"'
        });
      }

      // Check if listing exists and belongs to user
      const [listing] = await db.query(
        'SELECT * FROM listings WHERE id = ? AND user_id = ?',
        [listingId, userId]
      );

      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found or not owned by you'
        });
      }

      // Check if listing settings exist
      const [existingSettings] = await db.query(
        'SELECT * FROM listing_settings WHERE listing_id = ?',
        [listingId]
      );

      if (existingSettings) {
        // Update existing settings
        await db.query(
          'UPDATE listing_settings SET availability_mode = ? WHERE listing_id = ?',
          [mode, listingId]
        );
      } else {
        // Create new settings
        await db.query(
          'INSERT INTO listing_settings (listing_id, availability_mode) VALUES (?, ?)',
          [listingId, mode]
        );
      }

      res.status(200).json({
        status: 'success',
        data: {
          listing_id: listingId,
          availability_mode: mode
        }
      });
    } catch (error) {
      console.error('Error setting availability mode:', error);
      next(errorHandler(error));
    }
  },
  /**
* Toggle active status for a listing
* @param {Object} req - Express request object
* @param {Object} res - Express response object
* @param {Function} next - Express next middleware function
*/
  async toggleListingStatus(req, res, next) {
    try {
      const userId = req.user.id;
      const { listingId } = req.params;
      const { is_active } = req.body;

      // Check if listing exists and belongs to user
      const [listing] = await db.query(
        'SELECT * FROM listings WHERE id = ? AND user_id = ?',
        [listingId, userId]
      );

      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found or not owned by you'
        });
      }

      // Update listing status
      await db.query(
        'UPDATE listings SET active = ? WHERE id = ?',
        [is_active ? 1 : 0, listingId]
      );

      res.status(200).json({
        status: 'success',
        data: {
          id: listingId,
          is_active: is_active
        }
      });
    } catch (error) {
      console.error('Error toggling listing status:', error);
      next(errorHandler(error));
    }
  },

  /**
   * Get available time slots for a listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getListingAvailableSlots(req, res, next) {
    try {
      const userId = req.user.id;
      const { listingId } = req.params;
      const { start_date, end_date } = req.query;

      // Validate required parameters
      if (!start_date || !end_date) {
        return res.status(400).json({
          status: 'error',
          message: 'start_date and end_date are required'
        });
      }

      // Check if listing exists and belongs to user
      const [listing] = await db.query(
        'SELECT * FROM listings WHERE id = ? AND user_id = ?',
        [listingId, userId]
      );

      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found or not owned by you'
        });
      }

      // Get available slots
      const availableSlots = await getAvailableSlots(listingId, start_date, end_date);

      res.status(200).json({
        status: 'success',
        results: availableSlots.length,
        data: availableSlots
      });
    } catch (error) {
      console.error('Error getting available slots:', error);
      next(errorHandler(error));
    }
  },

  /**
   * Cleanup available slots for a listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async synchronizeListingAvailableSlots(req, res, next) {
    try {
      const userId = req.user.id;
      const { listingId } = req.params;

      // Check if listing exists and belongs to user
      const [listing] = await db.query(
        'SELECT * FROM listings WHERE id = ? AND user_id = ?',
        [listingId, userId]
      );

      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found or not owned by you'
        });
      }

      // First ensure the available_slots table exists
      try {
        await db.query(`
          CREATE TABLE IF NOT EXISTS available_slots (
            id INT AUTO_INCREMENT PRIMARY KEY,
            listing_id INT NOT NULL,
            start_datetime DATETIME NOT NULL,
            end_datetime DATETIME NOT NULL,
            slot_type ENUM('regular', 'generated', 'split', 'special') DEFAULT 'regular',
            price_override DECIMAL(10,2) NULL,
            booking_type ENUM('hourly', 'daily', 'night', 'appointment') NULL,
            slot_duration INT NULL,
            is_available BOOLEAN DEFAULT TRUE,
            original_availability_id INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
            INDEX idx_available_slots_listing_datetime (listing_id, start_datetime, end_datetime),
            INDEX idx_available_slots_listing_available (listing_id, is_available),
            INDEX idx_available_slots_datetime_range (start_datetime, end_datetime)
          )
        `);
      } catch (tableError) {
        console.error('Error creating available_slots table:', tableError);
      }

      // Cleanup available slots
      await cleanupAvailableSlots(listingId);

      res.status(200).json({
        status: 'success',
        message: 'Available slots cleaned up successfully'
      });
    } catch (error) {
      console.error('Error cleaning up available slots:', error);
      next(errorHandler(error));
    }
  },

  /**
   * Initialize and synchronize available slots for a listing
   * Creates the table if needed and populates data
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async initializeListingAvailableSlots(req, res, next) {
    try {
      const userId = req.user.id;
      const { listingId } = req.params;

      // Check if listing exists and belongs to user
      const [listing] = await db.query(
        'SELECT * FROM listings WHERE id = ? AND user_id = ?',
        [listingId, userId]
      );

      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found or not owned by you'
        });
      }

      // First, ensure the available_slots table exists
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS available_slots (
          id INT AUTO_INCREMENT PRIMARY KEY,
          listing_id INT NOT NULL,
          start_datetime DATETIME NOT NULL,
          end_datetime DATETIME NOT NULL,
          slot_type ENUM('regular', 'generated', 'split', 'special') DEFAULT 'regular',
          price_override DECIMAL(10,2) NULL,
          booking_type ENUM('hourly', 'daily', 'night', 'appointment') NULL,
          slot_duration INT NULL,
          is_available BOOLEAN DEFAULT TRUE,
          original_availability_id INT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
          FOREIGN KEY (original_availability_id) REFERENCES availability(id) ON DELETE SET NULL,
          INDEX idx_listing_datetime (listing_id, start_datetime, end_datetime),
          INDEX idx_availability (listing_id, is_available),
          INDEX idx_slot_type (slot_type)
        )
      `;

      await db.query(createTableSQL);

      // Now synchronize the data
      await cleanupAvailableSlots(listingId);
      // Get the synchronized data to return
      const availableSlots = await db.query(`
        SELECT 
          id,
          listing_id,
          start_datetime,
          end_datetime,
          slot_type,
          price_override,
          booking_type,
          slot_duration,
          is_available,
          original_availability_id,
          created_at,
          updated_at
        FROM available_slots 
        WHERE listing_id = ?
        ORDER BY start_datetime ASC
      `, [listingId]);

      res.status(200).json({
        status: 'success',
        message: 'Available slots initialized and synchronized successfully',
        results: availableSlots.length,
        data: availableSlots
      });

    } catch (error) {
      console.error('❌ Error initializing available slots:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to initialize available slots: ' + error.message
      });
    }
  },

  /**
   * Get today's reservations for host
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getTodayReservations(req, res, next) {
    try {
      const userId = req.user.id;
      const today = new Date().toISOString().split('T')[0];

      const todayReservations = await db.query(`
        SELECT b.id, b.id as booking_id, b.start_datetime as check_in_date, b.end_datetime as check_out_date, b.status,
               b.guests_count as guests, b.total_price, b.created_at,
               l.id as listing_id, l.title, l.location,
               (SELECT image_url FROM listing_photos WHERE listing_id = l.id AND is_cover = 1 LIMIT 1) as primary_image,
               u.id as guest_id, u.name as guest_name, u.profile_image as guest_profile_image,
               p.amount as paid_amount, p.status as payment_status, p.paid_at as payment_paid_at
        FROM bookings b
        JOIN listings l ON b.listing_id = l.id
        JOIN users u ON b.user_id = u.id
        LEFT JOIN payments p ON b.id = p.booking_id AND p.id = (
          SELECT MAX(id) FROM payments WHERE booking_id = b.id
        )
        WHERE l.user_id = ?
        AND (
          (DATE(b.start_datetime) <= ? AND DATE(b.end_datetime) >= ?) OR
          (DATE(b.start_datetime) = ?)
        )
        AND b.status IN ('pending', 'confirmed', 'completed')
        ORDER BY b.start_datetime ASC
      `, [userId, today, today, today]);

      // Format the data for the frontend
      const formattedReservations = todayReservations.map(booking => {
        // Format dates as YYYY-MM-DD HH:MM:SS
        const formatDateTime = (dateTime) => {
          if (!dateTime) return null;
          const date = new Date(dateTime);
          return date.getFullYear() + '-' +
            String(date.getMonth() + 1).padStart(2, '0') + '-' +
            String(date.getDate()).padStart(2, '0') + ' ' +
            String(date.getHours()).padStart(2, '0') + ':' +
            String(date.getMinutes()).padStart(2, '0') + ':' +
            String(date.getSeconds()).padStart(2, '0');
        };

        return {
          id: booking.id,
          booking_id: booking.booking_id,
          check_in_date: formatDateTime(booking.check_in_date),
          check_out_date: formatDateTime(booking.check_out_date),
          status: booking.status,
          guests: booking.guests,
          total_price: booking.total_price,
          paid_amount: booking.paid_amount,
          created_at: booking.created_at,
          listing: {
            id: booking.listing_id,
            title: booking.title,
            location: booking.location,
            primary_image: booking.primary_image
          },
          guest: {
            id: booking.guest_id,
            name: booking.guest_name,
            profile_image: booking.guest_profile_image
          }
        };
      });

      res.status(200).json({
        status: 'success',
        results: formattedReservations.length,
        data: formattedReservations
      });
    } catch (error) {
      console.error('Error getting today reservations:', error);
      next(errorHandler(error));
    }
  },

  /**
   * Get upcoming reservations for host
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getUpcomingReservations(req, res, next) {
    try {
      const userId = req.user.id;
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysLater = new Date();
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
      const thirtyDaysLaterStr = thirtyDaysLater.toISOString().split('T')[0];

      const upcomingReservations = await db.query(`
        SELECT b.id, b.id as booking_id, b.start_datetime as check_in_date, b.end_datetime as check_out_date, b.status,
               b.guests_count as guests, b.total_price, b.created_at,
               l.id as listing_id, l.title, l.location,
               (SELECT image_url FROM listing_photos WHERE listing_id = l.id AND is_cover = 1 LIMIT 1) as primary_image,
               u.id as guest_id, u.name as guest_name, u.profile_image as guest_profile_image,
               p.amount as paid_amount, p.status as payment_status, p.paid_at as payment_paid_at
        FROM bookings b
        JOIN listings l ON b.listing_id = l.id
        JOIN users u ON b.user_id = u.id
        LEFT JOIN payments p ON b.id = p.booking_id AND p.id = (
          SELECT MAX(id) FROM payments WHERE booking_id = b.id
        )
        WHERE l.user_id = ?
        AND DATE(b.start_datetime) > ?
        AND DATE(b.start_datetime) <= ?
        AND b.status IN ('pending', 'confirmed', 'completed')
        ORDER BY b.start_datetime ASC
      `, [userId, today, thirtyDaysLaterStr]);

      // Format the data for the frontend
      const formattedReservations = upcomingReservations.map(booking => {
        // Format dates as YYYY-MM-DD HH:MM:SS
        const formatDateTime = (dateTime) => {
          if (!dateTime) return null;
          const date = new Date(dateTime);
          return date.getFullYear() + '-' +
            String(date.getMonth() + 1).padStart(2, '0') + '-' +
            String(date.getDate()).padStart(2, '0') + ' ' +
            String(date.getHours()).padStart(2, '0') + ':' +
            String(date.getMinutes()).padStart(2, '0') + ':' +
            String(date.getSeconds()).padStart(2, '0');
        };

        return {
          id: booking.id,
          booking_id: booking.booking_id,
          check_in_date: formatDateTime(booking.check_in_date),
          check_out_date: formatDateTime(booking.check_out_date),
          status: booking.status,
          guests: booking.guests,
          total_price: booking.total_price,
          paid_amount: booking.paid_amount,
          created_at: booking.created_at,
          listing: {
            id: booking.listing_id,
            title: booking.title,
            location: booking.location,
            primary_image: booking.primary_image
          },
          guest: {
            id: booking.guest_id,
            name: booking.guest_name,
            profile_image: booking.guest_profile_image
          }
        };
      });

      res.status(200).json({
        status: 'success',
        results: formattedReservations.length,
        data: formattedReservations
      });
    } catch (error) {
      console.error('Error getting upcoming reservations:', error);
      next(errorHandler(error));
    }
  },
};

// Export both the hostController and the utility functions
module.exports = {
  ...hostController,
  cleanupAvailableSlots,
  getAvailableSlots,
  getPublicAvailableSlots,
  subtractReservationsFromSlots,
  generateDurationBasedSlots,
  toMySQLDateTime
};
