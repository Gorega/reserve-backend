const db = require('../config/database');
const { notFound, badRequest } = require('../utils/errorHandler');

/**
 * Pricing Option Model
 * Handles all database operations for pricing options
 */
const pricingOptionModel = {
  /**
   * Get all pricing options for a listing
   * @param {number} listingId - Listing ID
   * @returns {Promise<Array>} - List of pricing options
   */
  async getByListingId(listingId) {
    try {
      const options = await db.query(
        'SELECT * FROM pricing_options WHERE listing_id = ? ORDER BY is_default DESC, price ASC',
        [listingId]
      );
      return options;
    } catch (error) {
      console.error('Error getting pricing options:', error);
      throw error;
    }
  },

  /**
   * Get a pricing option by ID
   * @param {number} id - Pricing option ID
   * @returns {Promise<Object>} - Pricing option
   */
  async getById(id) {
    try {
      const options = await db.query(
        'SELECT * FROM pricing_options WHERE id = ?',
        [id]
      );
      
      if (options.length === 0) {
        throw notFound('Pricing option not found');
      }
      
      return options[0];
    } catch (error) {
      console.error('Error getting pricing option:', error);
      throw error;
    }
  },

  /**
   * Create a new pricing option
   * @param {Object} data - Pricing option data
   * @returns {Promise<Object>} - Created pricing option
   */
  async create(data) {
    try {
      // Validate required fields
      if (!data.listing_id || !data.price || !data.unit_type) {
        throw badRequest('Listing ID, price, and unit type are required');
      }

      // Set default values if not provided
      data.duration = data.duration || 1;
      data.minimum_units = data.minimum_units || 1;
      
      // Remove custom id if present (client may send string IDs)
      if (data.id && typeof data.id === 'string') {
        delete data.id;
      }
      
      // If this is set as default, unset any existing defaults for this listing
      if (data.is_default) {
        await db.query(
          'UPDATE pricing_options SET is_default = 0 WHERE listing_id = ?',
          [data.listing_id]
        );
      }
      
      // If no default is specified and this is the first option, make it default
      if (data.is_default === undefined) {
        const existingOptions = await this.getByListingId(data.listing_id);
        if (existingOptions.length === 0) {
          data.is_default = true;
        }
      }

      const result = await db.insert('pricing_options', data);
      
      return {
        id: result.insertId,
        ...data
      };
    } catch (error) {
      console.error('Error creating pricing option:', error);
      throw error;
    }
  },

  /**
   * Update a pricing option
   * @param {number} id - Pricing option ID
   * @param {Object} data - Updated pricing option data
   * @returns {Promise<Object>} - Updated pricing option
   */
  async update(id, data) {
    try {
      // Get the current pricing option
      const currentOption = await this.getById(id);
      
      // If this is set as default, unset any existing defaults for this listing
      if (data.is_default) {
        await db.query(
          'UPDATE pricing_options SET is_default = 0 WHERE listing_id = ? AND id != ?',
          [currentOption.listing_id, id]
        );
      }
      
      await db.update('pricing_options', id, data);
      
      return {
        id,
        ...currentOption,
        ...data
      };
    } catch (error) {
      console.error('Error updating pricing option:', error);
      throw error;
    }
  },

  /**
   * Delete a pricing option
   * @param {number} id - Pricing option ID
   * @returns {Promise<boolean>} - Success status
   */
  async delete(id) {
    try {
      // Get the current option before deleting
      const option = await this.getById(id);
      
      await db.remove('pricing_options', id);
      
      // If this was the default option, set another one as default
      if (option.is_default) {
        const remainingOptions = await this.getByListingId(option.listing_id);
        if (remainingOptions.length > 0) {
          await this.update(remainingOptions[0].id, { is_default: true });
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error deleting pricing option:', error);
      throw error;
    }
  },

  /**
   * Create multiple pricing options at once
   * @param {number} listingId - Listing ID
   * @param {Array} options - Array of pricing option data
   * @param {Object} connection - Optional database connection for transaction
   * @returns {Promise<Array>} - Created pricing options
   */
  async createMultiple(listingId, options, connection = null) {
    // Determine if we need to manage our own connection or use the provided one
    const useProvidedConnection = connection !== null;
    let conn = connection;
    
    try {
      if (!Array.isArray(options) || options.length === 0) {
        throw badRequest('At least one pricing option is required');
      }
      
      // Set listing_id for all options and clean up data
      const optionsWithListingId = options.map(option => {
        // Create a clean copy without client-specific IDs
        const cleanOption = { 
          price: parseFloat(option.price),
          unit_type: option.unit_type,
          duration: parseInt(option.duration) || 1,
          minimum_units: parseInt(option.minimum_units) || 1,
          is_default: Boolean(option.is_default),
          listing_id: parseInt(listingId)
        };
        
        return cleanOption;
      });
      
      // Find the default option
      const defaultOption = optionsWithListingId.find(option => option.is_default);
      
      // If no default is specified, make the first one default
      if (!defaultOption) {
        optionsWithListingId[0].is_default = true;
      }
      
      // Get a connection if one wasn't provided
      if (!useProvidedConnection) {
        conn = await db.getPool().getConnection();
        await conn.beginTransaction();
      }
      
      // Clear existing options for this listing
      await conn.query('DELETE FROM pricing_options WHERE listing_id = ?', [listingId]);
      
      // Create each option using direct connection queries
      const createdOptions = [];
      for (const option of optionsWithListingId) {
        // Insert directly with the connection
        const [result] = await conn.query(
          'INSERT INTO pricing_options (price, unit_type, duration, minimum_units, is_default, listing_id) VALUES (?, ?, ?, ?, ?, ?)',
          [
            option.price,
            option.unit_type,
            option.duration,
            option.minimum_units,
            option.is_default ? 1 : 0,
            option.listing_id
          ]
        );
        
        createdOptions.push({
          id: result.insertId,
          ...option
        });
      }
      
      // Commit the transaction if we created our own connection
      if (!useProvidedConnection) {
        await conn.commit();
      }
      
      return createdOptions;
    } catch (error) {
      console.error('Error creating multiple pricing options:', error);
      
      // Rollback if we created our own connection
      if (!useProvidedConnection && conn) {
        try {
          await conn.rollback();
        } catch (rollbackError) {
          console.error('Error rolling back transaction:', rollbackError);
        }
      }
      
      throw error;
    } finally {
      // Release the connection if we created it
      if (!useProvidedConnection && conn) {
        try {
          conn.release();
        } catch (releaseError) {
          console.error('Error releasing connection:', releaseError);
        }
      }
    }
  },

  /**
   * Get the default pricing option for a listing
   * @param {number} listingId - Listing ID
   * @returns {Promise<Object|null>} - Default pricing option or null
   */
  async getDefaultByListingId(listingId) {
    try {
      const options = await db.query(
        'SELECT * FROM pricing_options WHERE listing_id = ? AND is_default = 1',
        [listingId]
      );
      
      if (options.length === 0) {
        // Try to get any pricing option if no default is set
        const allOptions = await this.getByListingId(listingId);
        return allOptions.length > 0 ? allOptions[0] : null;
      }
      
      return options[0];
    } catch (error) {
      console.error('Error getting default pricing option:', error);
      throw error;
    }
  }
};

module.exports = pricingOptionModel;
