const db = require('../config/database');
const { notFound, badRequest } = require('../utils/errorHandler');

/**
 * Listing Model
 * Handles all database operations for listings
 */
const listingModel = {
  /**
   * Get all listings with optional filtering
   * @param {Object} filters - Optional filters
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Array>} - List of listings
   */
  async getAll(filters = {}, page = 1, limit = 10) {
    try {
      const offset = (page - 1) * limit;
      
      let query = `
        SELECT l.*, c.name as category_name, c.translated_name as category_translated_name, 
               u.name as host_name, u.profile_image as host_image,
               pc.id as parent_category_id, pc.name as parent_category_name, 
               pc.translated_name as parent_category_translated_name,
               (SELECT image_url FROM listing_photos WHERE listing_id = l.id AND is_cover = 1 LIMIT 1) as cover_photo
        FROM listings l
        JOIN users u ON l.user_id = u.id
        JOIN categories c ON l.category_id = c.id
        LEFT JOIN categories pc ON c.parent_id = pc.id
        WHERE l.active = 1
      `;
      
      const params = [];
      
      // Add basic filters
      if (filters.category_id) {
        query += ' AND l.category_id = ?';
        params.push(filters.category_id);
      }
      
      if (filters.search) {
        query += ' AND (l.title LIKE ? OR l.location LIKE ?)';
        params.push(`%${filters.search}%`, `%${filters.search}%`);
      }
      
      // Date availability filtering with consistent YYYY-MM-DD format
      if (filters.start_date && filters.end_date) {
        // Use dates directly as YYYY-MM-DD format to avoid timezone issues
        let formattedStartDate, formattedEndDate;
        
        // Ensure we're working with YYYY-MM-DD format
        if (!filters.start_date.includes('T') && !filters.start_date.includes(' ')) {
          formattedStartDate = `${filters.start_date} 00:00:00`;
        } else {
          const datePart = filters.start_date.split('T')[0];
          formattedStartDate = `${datePart} 00:00:00`;
        }
        
        if (!filters.end_date.includes('T') && !filters.end_date.includes(' ')) {
          formattedEndDate = `${filters.end_date} 23:59:59`;
        } else {
          const datePart = filters.end_date.split('T')[0];
          formattedEndDate = `${datePart} 23:59:59`;
        }
        
        // Exclude listings that have blocked dates during the requested period
        query += `
          AND l.id NOT IN (
            SELECT DISTINCT listing_id FROM blocked_dates 
            WHERE (
              (start_datetime <= ? AND end_datetime >= ?) OR
              (start_datetime <= ? AND end_datetime >= ?) OR
              (start_datetime >= ? AND end_datetime <= ?)
            )
          )
        `;
        params.push(formattedEndDate, formattedStartDate, formattedStartDate, formattedEndDate, formattedStartDate, formattedEndDate);
      }
      
      // Add sorting
      query += ' ORDER BY l.created_at DESC';
      
      // Add pagination
      const limitInt = parseInt(limit);
      const offsetInt = parseInt(offset);
      query += ` LIMIT ${limitInt} OFFSET ${offsetInt}`;
      
      const listings = await db.query(query, params);
      return listings;
    } catch (error) {
      console.error('Error getting listings:', error);
      throw error;
    }
  },

  /**
   * Get listing by ID
   * @param {number} id - Listing ID
   * @returns {Promise<Object>} - Listing object with all details
   */
  async getById(id) {
    try {
      const query = `
        SELECT l.*, c.name as category_name, c.translated_name as category_translated_name, 
               u.name as host_name, u.profile_image as host_image,
               u.id as host_id, u.is_provider,
               pc.id as parent_category_id, pc.name as parent_category_name, 
               pc.translated_name as parent_category_translated_name
        FROM listings l
        JOIN users u ON l.user_id = u.id
        JOIN categories c ON l.category_id = c.id
        LEFT JOIN categories pc ON c.parent_id = pc.id
        WHERE l.id = ?
      `;
      
      const listings = await db.query(query, [id]);
      
      if (listings.length === 0) {
        throw notFound('Listing not found');
      }
      
      const listing = listings[0];
      
      // Get listing photos
      const photosQuery = `
        SELECT id, image_url, is_cover
        FROM listing_photos
        WHERE listing_id = ?
        ORDER BY is_cover DESC, id ASC
      `;
      
      listing.photos = await db.query(photosQuery, [id]);
      
      return listing;
    } catch (error) {
      console.error('Error getting listing by ID:', error);
      throw error;
    }
  },

  /**
   * Check if a listing is available for a given time period
   * @param {number} listingId - Listing ID
   * @param {string} startDatetime - Start datetime in ISO format
   * @param {string} endDatetime - End datetime in ISO format
   * @returns {Promise<boolean>} - True if available, false if not
   */
  async checkAvailability(listingId, startDatetime, endDatetime) {
    try {
      // Check if listing exists
      const listing = await this.getById(listingId);
      
      if (!listing) {
        throw notFound('Listing not found');
      }
      
      // Format datetime strings for MySQL - keep dates as YYYY-MM-DD to avoid timezone issues
      const formatDateForMySQL = (dateString) => {
        if (!dateString.includes('T') && !dateString.includes(' ')) {
          return `${dateString} 00:00:00`;
        } else {
          const datePart = dateString.split('T')[0];
          const timePart = dateString.includes('T') ? dateString.split('T')[1].split('.')[0] : '00:00:00';
          return `${datePart} ${timePart}`;
        }
      };
      
      const formattedStartDatetime = formatDateForMySQL(startDatetime);
      let formattedEndDatetime;

      if (!endDatetime.includes('T') && !endDatetime.includes(' ')) {
        formattedEndDatetime = `${endDatetime} 23:59:59`;
      } else {
        formattedEndDatetime = formatDateForMySQL(endDatetime);
      }
      
      // Get the availability mode for this listing
      const [listingSettings] = await db.query(
        'SELECT availability_mode FROM listing_settings WHERE listing_id = ?',
        [listingId]
      );
      
      const availabilityMode = listingSettings?.availability_mode || 'available-by-default';
      
      if (availabilityMode === 'blocked-by-default') {
        // In blocked-by-default mode, check if dates are explicitly available
        const availabilityQuery = `
          SELECT date FROM availability 
          WHERE listing_id = ? 
          AND is_available = 1
          AND date BETWEEN DATE(?) AND DATE(?)
        `;
        
        const availableDates = await db.query(availabilityQuery, [
          listingId,
          formattedStartDatetime,
          formattedEndDatetime
        ]);
        
        const startDate = new Date(startDatetime);
        const endDate = new Date(endDatetime);
        const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
        
        if (availableDates.length < daysDiff) {
          return false;
        }
      } else {
        // In available-by-default mode, check for blocked dates
        const blockedDatesQuery = `
          SELECT * FROM blocked_dates 
          WHERE listing_id = ? 
          AND (
            (start_datetime <= ? AND end_datetime >= ?) OR
            (start_datetime <= ? AND end_datetime >= ?) OR
            (start_datetime >= ? AND end_datetime <= ?)
          )
        `;
        
        const blockedDates = await db.query(blockedDatesQuery, [
          listingId,
          formattedStartDatetime, formattedStartDatetime,
          formattedEndDatetime, formattedEndDatetime,
          formattedStartDatetime, formattedEndDatetime
        ]);
        
        if (blockedDates.length > 0) {
          return false;
        }
      }
      
      // Check for booking conflicts
      const bookingsQuery = `
        SELECT * FROM bookings 
        WHERE listing_id = ? 
        AND status IN ('pending', 'confirmed')
        AND (
          (start_datetime <= ? AND end_datetime >= ?) OR
          (start_datetime <= ? AND end_datetime >= ?) OR
          (start_datetime >= ? AND end_datetime <= ?)
        )
      `;
      
      const bookings = await db.query(bookingsQuery, [
        listingId,
        formattedStartDatetime, formattedStartDatetime,
        formattedEndDatetime, formattedEndDatetime,
        formattedStartDatetime, formattedEndDatetime
      ]);
      
      if (bookings.length > 0) {
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error checking availability:', error);
      throw error;
    }
  }
};

module.exports = listingModel;
