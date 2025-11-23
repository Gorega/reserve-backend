const db = require('../config/database');
const { notFound } = require('../utils/errorHandler');
const pricingOptionModel = require('./pricingOptionModel');

/**
 * Category Model
 * Handles all database operations for the categories table
 */
const categoryModel = {
  /**
   * Get all categories
   * @returns {Promise<Array>} - List of categories
   */
  async getAll() {
    try {
      const query = `
        SELECT c.*, p.name as parent_name, p.translated_name as parent_translated_name
        FROM categories c
        LEFT JOIN categories p ON c.parent_id = p.id
        ORDER BY COALESCE(c.parent_id, c.id), c.name
      `;
      const categories = await db.query(query);
      return categories;
    } catch (error) {
      console.error('Error getting categories:', error);
      throw error;
    }
  },
  
  /**
   * Get main categories (parent_id IS NULL)
   * @returns {Promise<Array>} - List of main categories
   */
  async getMainCategories() {
    try {
      const categories = await db.query('SELECT * FROM categories WHERE parent_id IS NULL ORDER BY id');
      return categories;
    } catch (error) {
      console.error('Error getting main categories:', error);
      throw error;
    }
  },
  
  /**
   * Get subcategories by parent ID
   * @param {number} parentId - Parent category ID
   * @returns {Promise<Array>} - List of subcategories
   */
  async getSubcategories(parentId) {
    try {
      const subcategories = await db.query('SELECT * FROM categories WHERE parent_id = ? ORDER BY name', [parentId]);
      return subcategories;
    } catch (error) {
      console.error('Error getting subcategories:', error);
      throw error;
    }
  },
  
  /**
   * Get category by ID
   * @param {number} id - Category ID
   * @returns {Promise<Object>} - Category object
   */
  async getById(id) {
    try {
      const query = `
        SELECT c.*, p.name as parent_name, p.translated_name as parent_translated_name
        FROM categories c
        LEFT JOIN categories p ON c.parent_id = p.id
        WHERE c.id = ?
      `;
      
      const categories = await db.query(query, [id]);
      
      if (categories.length === 0) {
        throw notFound('Category not found');
      }
      
      return categories[0];
    } catch (error) {
      console.error('Error getting category by ID:', error);
      throw error;
    }
  },
  
  /**
   * Create a new category
   * @param {Object} categoryData - Category data
   * @returns {Promise<Object>} - Created category
   */
  async create(categoryData) {
    try {
      const result = await db.insert('categories', categoryData);
      const category = await this.getById(result.insertId);
      return category;
    } catch (error) {
      console.error('Error creating category:', error);
      throw error;
    }
  },
  
  /**
   * Update a category
   * @param {number} id - Category ID
   * @param {Object} categoryData - Category data
   * @returns {Promise<Object>} - Updated category
   */
  async update(id, categoryData) {
    try {
      await db.update('categories', id, categoryData);
      const category = await this.getById(id);
      return category;
    } catch (error) {
      console.error('Error updating category:', error);
      throw error;
    }
  },
  
  /**
   * Delete a category
   * @param {number} id - Category ID
   * @returns {Promise<boolean>} - Success status
   */
  async delete(id) {
    try {
      // Check if category has subcategories
      const subcategories = await this.getSubcategories(id);
      if (subcategories.length > 0) {
        throw new Error('Cannot delete category with subcategories');
      }
      
      // Check if category is used in listings
      const listings = await db.query('SELECT id FROM listings WHERE category_id = ? LIMIT 1', [id]);
      if (listings.length > 0) {
        throw new Error('Cannot delete category used in listings');
      }
      
      await db.remove('categories', id);
      return true;
    } catch (error) {
      console.error('Error deleting category:', error);
      throw error;
    }
  },
  
  /**
   * Get listings by category ID
   * @param {number} categoryId - Category ID
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @param {boolean} includeSubcategories - Whether to include listings from subcategories
   * @param {Object} filters - Additional filters (like dates)
   * @returns {Promise<Array>} - List of listings
   */
  async getListings(categoryId, page = 1, limit = 10, includeSubcategories = false, filters = {}) {
    try {
      // Ensure parameters are valid numbers
      const categoryIdNum = parseInt(categoryId, 10);
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;
      const offset = (pageNum - 1) * limitNum;
      
      // First check if this is a main category
      const category = await this.getById(categoryIdNum);
      
      let query;
      let params = [];
      
      // Check if this is a main category (parent_id is null)
      // We need to be careful here as the parent_id might be coming from the joined table
      const isMainCategory = !category.parent_id;
      
      // Base query with joins
      query = `
        SELECT l.*, u.name as host_name, c.name as category_name, c.translated_name as category_translated_name,
               (SELECT image_url FROM listing_photos WHERE listing_id = l.id AND is_cover = 1 LIMIT 1) as cover_photo
        FROM listings l
        JOIN users u ON l.user_id = u.id
        JOIN categories c ON l.category_id = c.id
        WHERE l.active = 1 AND 
      `;
      
      // Add category filtering
      if (isMainCategory && includeSubcategories) {
        // This is a main category and we want to include subcategories
        query += `(c.parent_id = ? OR c.id = ?)`;
        params.push(categoryIdNum, categoryIdNum);
      } else {
        // This is either a subcategory or a main category where we don't want subcategories
        query += `l.category_id = ?`;
        params.push(categoryIdNum);
      }
      
      // Date availability filtering
      if (filters.start_date && filters.end_date) {
        const startDate = new Date(filters.start_date);
        const endDate = new Date(filters.end_date);
        
        if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
          // Format dates for MySQL
          // If the input is just a date (YYYY-MM-DD), add time components
          let formattedStartDate, formattedEndDate;
          
          // Check if the date strings include time components
          if (!filters.start_date.includes('T') && !filters.start_date.includes(' ')) {
            // Date only format - set to beginning of day
            formattedStartDate = `${filters.start_date} 00:00:00`;
          } else {
            // Already has time component
            formattedStartDate = startDate.toISOString().slice(0, 19).replace('T', ' ');
          }
          
          if (!filters.end_date.includes('T') && !filters.end_date.includes(' ')) {
            // Date only format - set to end of day
            formattedEndDate = `${filters.end_date} 23:59:59`;
          } else {
            // Already has time component
            formattedEndDate = endDate.toISOString().slice(0, 19).replace('T', ' ');
          }
          
          console.log(`Filtering dates from ${formattedStartDate} to ${formattedEndDate}`);
          
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
          
          // Also exclude listings with bookings during this period
          query += `
            AND l.id NOT IN (
              SELECT DISTINCT listing_id FROM bookings 
              WHERE status IN ('pending', 'confirmed', 'completed') 
              AND (
                (start_datetime <= ? AND end_datetime >= ?) OR
                (start_datetime <= ? AND end_datetime >= ?) OR
                (start_datetime >= ? AND end_datetime <= ?)
              )
            )
          `;
          params.push(formattedEndDate, formattedStartDate, formattedStartDate, formattedEndDate, formattedStartDate, formattedEndDate);
          
          // Handle listings with blocked-by-default availability mode - USING AVAILABLE_SLOTS TABLE
          query += `
            AND NOT EXISTS (
              SELECT 1 FROM listing_settings 
              WHERE listing_id = l.id 
              AND availability_mode = 'blocked-by-default'
              AND NOT EXISTS (
                SELECT 1 FROM available_slots 
                WHERE listing_id = l.id 
                AND is_available = 1
                AND start_datetime <= ? 
                AND end_datetime >= ?
              )
            )
          `;
          params.push(formattedEndDate, formattedStartDate);
        }
      }
      
      // Location filter
      if (filters.location) {
        query += ` AND l.location LIKE ?`;
        params.push(`%${filters.location}%`);
      }

      // Combined search filter (searches in both title and location)
      if (filters.search) {
        query += ` AND (l.title LIKE ? OR l.location LIKE ? OR l.description LIKE ?)`;
        params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
      }
      
      // Add sorting and pagination
      query += ` ORDER BY l.created_at DESC LIMIT ${limitNum} OFFSET ${offset}`;
      
      const listings = await db.query(query, params);
      
      // Add pricing options with duration for each listing
      if (listings.length > 0) {
        for (const listing of listings) {
          // Get pricing options for this listing
          listing.pricing_options = await pricingOptionModel.getByListingId(listing.id);
          
          // Add duration to the main listing object for the default pricing option
          if (listing.pricing_options && listing.pricing_options.length > 0) {
            const defaultOption = listing.pricing_options.find(option => option.is_default) || listing.pricing_options[0];
            listing.price_duration = defaultOption.duration || 1;
            listing.price_unit_type = defaultOption.unit_type || listing.unit_type;
          }
        }
      }
      
      return listings;
    } catch (error) {
      console.error('Error getting listings by category:', error);
      throw error;
    }
  }
};

module.exports = categoryModel;