const db = require('../config/database');
const { notFound, badRequest } = require('../utils/errorHandler');

/**
 * Special Pricing Model
 * Handles all database operations for date-specific special pricing
 */
const specialPricingModel = {
  /**
   * Get all special pricing for a listing (both specific dates and recurring patterns)
   * @param {number} listingId - Listing ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<Array>} - List of special pricing entries
   */
  async getByListingId(listingId, startDate = null, endDate = null) {
    try {
      let query = `
        SELECT sp.*, po.unit_type, po.duration, po.is_default
        FROM special_pricing sp
        LEFT JOIN pricing_options po ON (
          (sp.pricing_option = 'per_hour' AND po.unit_type = 'hour') OR
          (sp.pricing_option = 'per_day' AND po.unit_type = 'day') OR
          (sp.pricing_option = 'per_night' AND po.unit_type = 'night')
        ) AND po.listing_id = sp.listing_id
        WHERE sp.listing_id = ?
      `;
      const params = [listingId];
      
      if (startDate && endDate) {
        query += ` AND (
          (sp.is_recurring = 0 AND sp.date BETWEEN ? AND ?) OR
          (sp.is_recurring = 1 AND (
            sp.start_date IS NULL OR sp.start_date <= ?
          ) AND (
            sp.end_date IS NULL OR sp.end_date >= ?
          ))
        )`;
        params.push(startDate, endDate, endDate, startDate);
      }
      
      query += ' ORDER BY sp.is_recurring ASC, sp.date ASC, sp.day_of_week ASC';
      
      const specialPricing = await db.query(query, params);
      return specialPricing;
    } catch (error) {
      console.error('Error getting special pricing:', error);
      throw error;
    }
  },

  /**
   * Get recurring special pricing by day of week
   * @param {number} listingId - Listing ID
   * @param {number} dayOfWeek - Day of week (0-6)
   * @param {number} pricingOptionId - Pricing option ID (optional)
   * @returns {Promise<Object|null>} - Recurring special pricing entry or null
   */
  async getRecurringByDayOfWeek(listingId, dayOfWeek, pricingOptionId = null) {
    try {
      // Convert numeric day of week to string day name if needed
      let dayOfWeekStr = dayOfWeek;
      if (typeof dayOfWeek === 'number') {
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        dayOfWeekStr = dayNames[dayOfWeek];
      }
      let query = `
        SELECT sp.*, po.unit_type, po.duration, po.is_default
        FROM special_pricing sp
        LEFT JOIN pricing_options po ON (
          (sp.pricing_option = 'per_hour' AND po.unit_type = 'hour') OR
          (sp.pricing_option = 'per_day' AND po.unit_type = 'day') OR
          (sp.pricing_option = 'per_night' AND po.unit_type = 'night')
        ) AND po.listing_id = sp.listing_id
        WHERE sp.listing_id = ? AND sp.is_recurring = 1 AND sp.day_of_week = ?
        AND (
          sp.start_date IS NULL OR sp.start_date <= ?
        ) AND (
          sp.end_date IS NULL OR sp.end_date >= ?
        )
      `;
      const currentDate = new Date().toISOString().split('T')[0];
      const params = [listingId, dayOfWeekStr, currentDate, currentDate];
      
      if (pricingOptionId) {
        // Convert pricingOptionId to the corresponding ENUM value
        let pricingOptionEnum = null;
        if (pricingOptionId === 1 || pricingOptionId === 'hour') pricingOptionEnum = 'per_hour';
        else if (pricingOptionId === 2 || pricingOptionId === 'day') pricingOptionEnum = 'per_day';
        else if (pricingOptionId === 3 || pricingOptionId === 'night') pricingOptionEnum = 'per_night';
        
        if (pricingOptionEnum) {
          query += ' AND sp.pricing_option = ?';
          params.push(pricingOptionEnum);
        }
      }
      
      query += ' LIMIT 1';
      
      const result = await db.query(query, params);
      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error('Error getting recurring special pricing by day of week:', error);
      throw error;
    }
  },

  /**
   * Get special pricing for a specific date (checks both specific dates and recurring patterns)
   * @param {number} listingId - Listing ID
   * @param {string} date - Date (YYYY-MM-DD)
   * @param {number} pricingOptionId - Pricing option ID (optional)
   * @returns {Promise<Object|null>} - Special pricing entry or null
   */
  async getByDate(listingId, date, pricingOptionId = null) {
    try {
      const dayOfWeekNum = new Date(date + 'T00:00:00').getDay();
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayOfWeek = dayNames[dayOfWeekNum];
      
      let query = `
        SELECT sp.*, po.unit_type, po.duration, po.is_default
        FROM special_pricing sp
        LEFT JOIN pricing_options po ON (
          (sp.pricing_option = 'per_hour' AND po.unit_type = 'hour') OR
          (sp.pricing_option = 'per_day' AND po.unit_type = 'day') OR
          (sp.pricing_option = 'per_night' AND po.unit_type = 'night')
        ) AND po.listing_id = sp.listing_id
        WHERE sp.listing_id = ?
        AND (
          (sp.is_recurring = 0 AND sp.date = ?) OR
          (sp.is_recurring = 1 AND sp.day_of_week = ? AND (
            sp.start_date IS NULL OR sp.start_date <= ?
          ) AND (
            sp.end_date IS NULL OR sp.end_date >= ?
          ))
        )`;
      const params = [listingId, date, dayOfWeek, date, date];
      
      if (pricingOptionId) {
        // Convert pricingOptionId to the corresponding ENUM value
        let pricingOptionEnum = null;
        if (pricingOptionId === 1 || pricingOptionId === 'hour') pricingOptionEnum = 'per_hour';
        else if (pricingOptionId === 2 || pricingOptionId === 'day') pricingOptionEnum = 'per_day';
        else if (pricingOptionId === 3 || pricingOptionId === 'night') pricingOptionEnum = 'per_night';
        
        if (pricingOptionEnum) {
          query += ' AND sp.pricing_option = ?';
          params.push(pricingOptionEnum);
        }
      }
      
      // Prioritize specific date over recurring pattern
      query += ' ORDER BY sp.is_recurring ASC LIMIT 1';
      
      const result = await db.query(query, params);
      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error('Error getting special pricing by date:', error);
      throw error;
    }
  },

  /**
    * Get recurring special pricing patterns for a listing
    * @param {number} listingId - Listing ID
    * @param {number} pricingOptionId - Pricing option ID (optional)
    * @returns {Promise<Array>} - List of recurring special pricing entries
    */
   async getRecurringPatterns(listingId, pricingOptionId = null) {
     try {
       let query = `
         SELECT sp.*, po.unit_type, po.duration, po.is_default
         FROM special_pricing sp
         LEFT JOIN pricing_options po ON (
           (sp.pricing_option = 'per_hour' AND po.unit_type = 'hour') OR
           (sp.pricing_option = 'per_day' AND po.unit_type = 'day') OR
           (sp.pricing_option = 'per_night' AND po.unit_type = 'night')
         ) AND po.listing_id = sp.listing_id
         WHERE sp.listing_id = ? AND sp.is_recurring = 1
       `;
       const params = [listingId];
       
       if (pricingOptionId) {
         // Convert pricingOptionId to the corresponding ENUM value
         let pricingOptionEnum = null;
         if (pricingOptionId === 1 || pricingOptionId === 'hour') pricingOptionEnum = 'per_hour';
         else if (pricingOptionId === 2 || pricingOptionId === 'day') pricingOptionEnum = 'per_day';
         else if (pricingOptionId === 3 || pricingOptionId === 'night') pricingOptionEnum = 'per_night';
         
         if (pricingOptionEnum) {
           query += ' AND sp.pricing_option = ?';
           params.push(pricingOptionEnum);
         }
       }
       
       query += ' ORDER BY sp.day_of_week ASC';
       
       const recurringPricing = await db.query(query, params);
       return recurringPricing;
     } catch (error) {
       console.error('Error getting recurring special pricing:', error);
       throw error;
     }
   },

  /**
   * Create special pricing (for specific dates or recurring patterns)
   * @param {Object} data - Special pricing data
   * @returns {Promise<Object>} - Created special pricing entry
   */
  async create(data, connection = null) {
    try {
      // Validate required fields
      if (!data.listing_id || (!data.pricing_option && !data.pricing_option_id) || (!data.price && !data.special_price)) {
        throw badRequest('Listing ID, pricing option, and price are required');
      }
      
      const isRecurring = data.is_recurring || false;
      
      if (isRecurring) {
        // Validate recurring pattern fields
        if (data.day_of_week === undefined || data.day_of_week === null) {
          throw badRequest('Day of week is required for recurring pricing');
        }
        
        // Convert numeric day_of_week to string day name if needed
        let dayOfWeekStr = data.day_of_week;
        if (typeof data.day_of_week === 'number') {
          if (data.day_of_week < 0 || data.day_of_week > 6) {
            throw badRequest('Day of week must be between 0 (Sunday) and 6 (Saturday)');
          }
          const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          dayOfWeekStr = dayNames[data.day_of_week];
        }
        data.day_of_week = dayOfWeekStr;
        
        // Check if recurring pattern already exists
        const existing = await this.getRecurringByDayOfWeek(data.listing_id, data.day_of_week, data.pricing_option || data.pricing_option_id);
        if (existing) {
          throw badRequest('Recurring special pricing already exists for this day of week and pricing option');
        }
      } else {
        // Validate specific date fields
        if (!data.date) {
          throw badRequest('Date is required for specific date pricing');
        }
        
        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(data.date)) {
          throw badRequest('Date must be in YYYY-MM-DD format');
        }
        
        // Check if special pricing already exists for this date
         const existing = await this.getByDate(data.listing_id, data.date, data.pricing_option || data.pricing_option_id);
         if (existing) {
           throw badRequest('Special pricing already exists for this date and pricing option');
         }
       }

      // Convert pricing_option_id to ENUM value if needed
      let pricingOption = data.pricing_option;
      if (!pricingOption && data.pricing_option_id) {
        if (data.pricing_option_id === 1 || data.pricing_option_id === 'hour') pricingOption = 'per_hour';
        else if (data.pricing_option_id === 2 || data.pricing_option_id === 'day') pricingOption = 'per_day';
        else if (data.pricing_option_id === 3 || data.pricing_option_id === 'night') pricingOption = 'per_night';
        else pricingOption = 'per_hour'; // default fallback
      }
      if (!pricingOption) pricingOption = 'per_hour'; // default fallback

      // Prepare data for insertion
      const insertData = {
        listing_id: data.listing_id,
        pricing_option: pricingOption,
        price: data.price || data.special_price,
        reason: data.reason || null,
        is_recurring: isRecurring
      };
      
      if (isRecurring) {
        insertData.day_of_week = data.day_of_week;
        insertData.start_date = data.start_date || data.recurring_start_date || null;
        insertData.end_date = data.end_date || data.recurring_end_date || null;
      } else {
        insertData.date = data.date;
      }

      const result = connection 
        ? await connection.query('INSERT INTO special_pricing SET ?', [insertData])
        : await db.insert('special_pricing', insertData);
      
      const insertId = connection ? result[0].insertId : result.insertId;
      
      return {
        id: insertId,
        ...data
      };
    } catch (error) {
      console.error('Error creating special pricing:', error);
      throw error;
    }
  },

  /**
   * Create multiple special pricing entries for date ranges
   * @param {Object} data - Special pricing data with date range
   * @returns {Promise<Array>} - Created special pricing entries
   */
  async createForDateRange(data) {
    try {
      const { listing_id, pricing_option, pricing_option_id, start_date, end_date, price, special_price, reason } = data;
      
      if (!listing_id || (!pricing_option && !pricing_option_id) || !start_date || !end_date || (!price && !special_price)) {
        throw badRequest('Listing ID, pricing option, start date, end date, and price are required');
      }

      const startDate = new Date(start_date);
      const endDate = new Date(end_date);
      
      if (startDate > endDate) {
        throw badRequest('Start date must be before or equal to end date');
      }

      const createdEntries = [];
      const currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        const dateString = currentDate.toISOString().split('T')[0];
        
        try {
          const entry = await this.create({
            listing_id,
            pricing_option: pricing_option || pricing_option_id,
            date: dateString,
            price: price || special_price,
            reason
          });
          createdEntries.push(entry);
        } catch (error) {
          // Skip if entry already exists, but log other errors
          if (!error.message.includes('already exists')) {
            console.error(`Error creating special pricing for ${dateString}:`, error);
          }
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      return createdEntries;
    } catch (error) {
      console.error('Error creating special pricing for date range:', error);
      throw error;
    }
  },

  /**
   * Update special pricing
   * @param {number} id - Special pricing ID
   * @param {Object} data - Updated special pricing data
   * @returns {Promise<Object>} - Updated special pricing entry
   */
  async update(id, data) {
    try {
      // Get the current special pricing entry
      const current = await db.query('SELECT * FROM special_pricing WHERE id = ?', [id]);
      if (current.length === 0) {
        throw notFound('Special pricing entry not found');
      }

      await db.update('special_pricing', id, data);
      
      return {
        id,
        ...current[0],
        ...data
      };
    } catch (error) {
      console.error('Error updating special pricing:', error);
      throw error;
    }
  },

  /**
   * Delete special pricing
   * @param {number} id - Special pricing ID
   * @returns {Promise<boolean>} - Success status
   */
  async delete(id) {
    try {
      const result = await db.remove('special_pricing', id);
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error deleting special pricing:', error);
      throw error;
    }
  },

  /**
   * Delete special pricing for a date range
   * @param {number} listingId - Listing ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @param {number} pricingOptionId - Pricing option ID (optional)
   * @returns {Promise<number>} - Number of deleted entries
   */
  async deleteForDateRange(listingId, startDate, endDate, pricingOptionId = null) {
    try {
      let query = 'DELETE FROM special_pricing WHERE listing_id = ? AND date BETWEEN ? AND ?';
      const params = [listingId, startDate, endDate];
      
      if (pricingOptionId) {
        query += ' AND pricing_option = ?';
        params.push(pricingOptionId);
      }
      
      const result = await db.query(query, params);
      return result.affectedRows;
    } catch (error) {
      console.error('Error deleting special pricing for date range:', error);
      throw error;
    }
  },

  /**
   * Get effective price for a specific date
   * @param {number} listingId - Listing ID
   * @param {string} date - Date (YYYY-MM-DD)
   * @param {number} pricingOptionId - Pricing option ID
   * @returns {Promise<Object>} - Price information with source
   */
  async getEffectivePrice(listingId, date, pricingOptionId) {
    try {
      // First check for special pricing
      const specialPricing = await this.getByDate(listingId, date, pricingOptionId);
      
      if (specialPricing) {
        return {
          price: specialPricing.price,
          source: 'special',
          special_pricing_id: specialPricing.id,
          reason: specialPricing.reason,
          unit_type: specialPricing.unit_type,
          duration: specialPricing.duration
        };
      }
      
      // Fallback to regular pricing option
      const pricingOption = await db.query(
        'SELECT * FROM pricing_options WHERE id = ? AND listing_id = ?',
        [pricingOptionId, listingId]
      );
      
      if (pricingOption.length === 0) {
        throw notFound('Pricing option not found');
      }
      
      return {
        price: pricingOption[0].price,
        source: 'regular',
        pricing_option_id: pricingOption[0].id,
        unit_type: pricingOption[0].unit_type,
        duration: pricingOption[0].duration
      };
    } catch (error) {
      console.error('Error getting effective price:', error);
      throw error;
    }
  }
};

module.exports = specialPricingModel;