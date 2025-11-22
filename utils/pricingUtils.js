/**
 * Utilities for handling pricing details in listings
 */

/**
 * Ensures the pricing_details field is properly formatted
 * and creates backward compatibility with legacy pricing fields
 * 
 * @param {Object} listingData - The listing data object
 * @returns {Object} - The updated listing data object
 */
function processPricingDetails(listingData) {
  // If no pricing_details provided, try to create it from legacy fields
  if (!listingData.pricing_details) {
    const pricingOptions = [];
    
    // Add hour pricing if exists
    if (listingData.price_per_hour) {
      pricingOptions.push({
        id: `price-hour-${Date.now()}-${Math.round(Math.random() * 1000)}`,
        price: parseFloat(listingData.price_per_hour),
        unit_type: 'hour',
        duration: 1
      });
    }
    
    // Add day pricing if exists
    if (listingData.price_per_day) {
      pricingOptions.push({
        id: `price-day-${Date.now()}-${Math.round(Math.random() * 1000)}`,
        price: parseFloat(listingData.price_per_day),
        unit_type: 'day',
        duration: 1
      });
    }
    
    // Add night pricing if exists
    if (listingData.price_per_half_night) {
      pricingOptions.push({
        id: `price-night-${Date.now()}-${Math.round(Math.random() * 1000)}`,
        price: parseFloat(listingData.price_per_half_night),
        unit_type: 'night',
        duration: 1
      });
    }
    
    if (pricingOptions.length > 0) {
      listingData.pricing_details = pricingOptions;
    }
  } else {
    // If pricing_details is a string, parse it
    if (typeof listingData.pricing_details === 'string') {
      try {
        listingData.pricing_details = JSON.parse(listingData.pricing_details);
      } catch (error) {
        console.error('Error parsing pricing details:', error);
        throw new Error('Invalid pricing details format');
      }
    }
  }
  
  // If we have pricing_details, update legacy fields for backward compatibility
  if (listingData.pricing_details && Array.isArray(listingData.pricing_details)) {
    const hourPrice = listingData.pricing_details.find(p => p.unit_type === 'hour');
    const dayPrice = listingData.pricing_details.find(p => p.unit_type === 'day');
    const nightPrice = listingData.pricing_details.find(p => p.unit_type === 'night');
    
    if (hourPrice) listingData.price_per_hour = parseFloat(hourPrice.price);
    if (dayPrice) listingData.price_per_day = parseFloat(dayPrice.price);
    if (nightPrice) listingData.price_per_half_night = parseFloat(nightPrice.price);
    
    // Set unit_type based on first pricing option if not already set
    if (!listingData.unit_type && listingData.pricing_details.length > 0) {
      listingData.unit_type = listingData.pricing_details[0].unit_type;
    }
  }
  
  return listingData;
}

/**
 * Ensures the pricing_details column exists in the database
 * @param {Object} connection - Database connection
 * @returns {Promise<boolean>} - Whether the column exists or was created
 */
async function ensurePricingDetailsColumn(connection) {
  try {
    // Check if pricing_details column exists
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'listings' AND COLUMN_NAME = 'pricing_details'
    `, [process.env.DB_NAME]);
    
    // If column doesn't exist, create it
    if (columns.length === 0) {
      await connection.query(`
        ALTER TABLE listings 
        ADD COLUMN pricing_details JSON DEFAULT NULL 
        AFTER price_per_half_night
      `);
      return true;
    }
    
    return true;
  } catch (error) {
    console.error('Error ensuring pricing_details column:', error);
    return false;
  }
}

module.exports = {
  processPricingDetails,
  ensurePricingDetailsColumn
};






