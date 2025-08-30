/**
 * Date utilities for consistent date handling across the application
 */

/**
 * Converts a date string or Date object to a UTC date string in YYYY-MM-DD format
 * @param {Date|string} date - Date object or date string
 * @returns {string} Date string in YYYY-MM-DD format
 */
const toUTCDateString = (date) => {
  if (!date) return null;
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) {
    throw new Error('Invalid date');
  }
  
  return dateObj.toISOString().split('T')[0];
};

/**
 * Converts a date string and time string to a UTC datetime string
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @param {string} timeStr - Time string in HH:MM:SS or HH:MM format
 * @returns {string} Datetime string in ISO format
 */
const createUTCDateTime = (dateStr, timeStr) => {
  if (!dateStr) return null;
  
  // Ensure time has seconds
  const normalizedTime = timeStr && !timeStr.includes(':') 
    ? `${timeStr}:00:00` 
    : (timeStr || '00:00:00');
  
  // Ensure time has seconds if only hours and minutes are provided
  const timeWithSeconds = normalizedTime.split(':').length === 2 
    ? `${normalizedTime}:00` 
    : normalizedTime;
  
  // Create date object and convert to ISO string
  const dateTimeStr = `${dateStr}T${timeWithSeconds}`;
  const dateObj = new Date(dateTimeStr);
  
  if (isNaN(dateObj.getTime())) {
    throw new Error(`Invalid date or time: ${dateTimeStr}`);
  }
  
  return dateObj.toISOString();
};

/**
 * Extracts time from a datetime string in HH:MM:SS format
 * @param {string} dateTimeStr - Datetime string
 * @returns {string} Time string in HH:MM:SS format
 */
const extractTimeFromDateTime = (dateTimeStr) => {
  if (!dateTimeStr) return null;
  
  try {
    // Handle both ISO format and MySQL datetime format
    if (dateTimeStr.includes('T')) {
      // ISO format: extract time part directly without timezone conversion
      return dateTimeStr.split('T')[1].substring(0, 8);
    } else if (dateTimeStr.includes(' ')) {
      // MySQL datetime format: extract time part directly
      const timePart = dateTimeStr.split(' ')[1];
      // Ensure we have HH:MM:SS format
      return timePart.length === 5 ? `${timePart}:00` : timePart.substring(0, 8);
    }
    
    return null;
  } catch (error) {
    return null;
  }
};

/**
 * Extracts date from a datetime string in YYYY-MM-DD format
 * @param {string} dateTimeStr - Datetime string
 * @returns {string} Date string in YYYY-MM-DD format
 */
const extractDateFromDateTime = (dateTimeStr) => {
  if (!dateTimeStr) return null;
  
  try {
    // Handle both ISO format and MySQL datetime format
    if (dateTimeStr.includes('T')) {
      // ISO format: extract date part directly without timezone conversion
      return dateTimeStr.split('T')[0];
    } else if (dateTimeStr.includes(' ')) {
      // MySQL datetime format: extract date part directly
      return dateTimeStr.split(' ')[0];
    }
    
    return null;
  } catch (error) {
    return null;
  }
};

/**
 * Checks if two date ranges overlap
 * @param {string|Date} start1 - Start of first range
 * @param {string|Date} end1 - End of first range
 * @param {string|Date} start2 - Start of second range
 * @param {string|Date} end2 - End of second range
 * @returns {boolean} True if ranges overlap
 */
const doDateRangesOverlap = (start1, end1, start2, end2) => {
  const s1 = new Date(start1).getTime();
  const e1 = new Date(end1).getTime();
  const s2 = new Date(start2).getTime();
  const e2 = new Date(end2).getTime();
  
  return (s1 <= e2 && e1 >= s2);
};

/**
 * Creates a date object with time set to start of day (00:00:00)
 * @param {string|Date} date - Date to set to start of day
 * @returns {Date} Date object set to start of day
 */
const startOfDay = (date) => {
  const dateObj = new Date(date);
  dateObj.setHours(0, 0, 0, 0);
  return dateObj;
};

/**
 * Creates a date object with time set to end of day (23:59:59.999)
 * @param {string|Date} date - Date to set to end of day
 * @returns {Date} Date object set to end of day
 */
const endOfDay = (date) => {
  const dateObj = new Date(date);
  dateObj.setHours(23, 59, 59, 999);
  return dateObj;
};

module.exports = {
  toUTCDateString,
  createUTCDateTime,
  extractTimeFromDateTime,
  extractDateFromDateTime,
  doDateRangesOverlap,
  startOfDay,
  endOfDay
};
