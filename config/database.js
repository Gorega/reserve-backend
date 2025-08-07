const mysql = require('mysql2/promise');

let pool;

/**
 * Creates and returns a MySQL connection pool
 * Uses environment variables for configuration
 * Implements connection pooling for better performance
 */
function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
      database: process.env.DB_NAME,

      // Performance tuning
      waitForConnections: true,
      connectionLimit: 20,       // increase if you have concurrent load
      queueLimit: 0,
      connectTimeout: 10000,     // 10s connect timeout
      enableKeepAlive: true,     // TCP keep-alive to avoid rehandshake
      keepAliveInitialDelay: 0,

      ssl: process.env.DB_SSL === 'true' ? {
        rejectUnauthorized: false // Required for some cloud DB providers
      } : false
    });
    
    // Global error handler for pool
    pool.on('error', err => console.error('MySQL_POOL_ERROR', err));
    
    console.log('MySQL connection pool created');
  }
  return pool;
}

/**
 * Execute a query with optional parameters
 * @param {string} sql - SQL query to execute
 * @param {Array} params - Parameters for the query
 * @returns {Promise} - Query results
 */
async function query(sql, params) {
  try {
    const pool = getPool();
    
    // Log the query and parameters for debugging
    console.log('SQL Query:', sql);
    console.log('Parameters:', JSON.stringify(params));
    
    // Make sure params is always an array
    const safeParams = Array.isArray(params) ? params : [];
    
    // Ensure all parameters are properly typed for MySQL
    const typedParams = safeParams.map(param => {
      if (param === undefined) return null;
      if (param === '') return '';
      return param;
    });
    
    // Execute the query with properly typed parameters
    const [results] = await pool.execute(sql, typedParams);
    return results;
  } catch (error) {
    console.error('Database query error:', error);
    console.error('Failed query:', sql);
    console.error('Query parameters:', JSON.stringify(params));
    
    // Add more detailed error information for debugging
    if (error.code === 'ER_WRONG_ARGUMENTS') {
      console.error('Parameter type issue detected. Check that all parameters match their expected types.');
      console.error('Parameter values:', params);
    }
    
    throw error;
  }
}

/**
 * Get a single record by ID
 * @param {string} table - Table name
 * @param {number|string} id - Record ID
 * @returns {Promise} - Single record or null
 */
async function getById(table, id) {
  try {
    const results = await query(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    return results.length ? results[0] : null;
  } catch (error) {
    console.error(`Error getting ${table} by ID:`, error);
    throw error;
  }
}

/**
 * Insert a record into a table
 * @param {string} table - Table name
 * @param {Object} data - Data to insert
 * @returns {Promise} - Insert result with insertId
 */
async function insert(table, data) {
  try {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map(() => '?').join(', ');
    
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
    const result = await query(sql, values);
    
    return result;
  } catch (error) {
    console.error(`Error inserting into ${table}:`, error);
    throw error;
  }
}

/**
 * Update a record in a table
 * @param {string} table - Table name
 * @param {number|string} id - Record ID
 * @param {Object} data - Data to update
 * @returns {Promise} - Update result
 */
async function update(table, id, data) {
  try {
    const keys = Object.keys(data);
    const values = Object.values(data);
    
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    const sql = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
    
    const result = await query(sql, [...values, id]);
    return result;
  } catch (error) {
    console.error(`Error updating ${table}:`, error);
    throw error;
  }
}

/**
 * Delete a record from a table
 * @param {string} table - Table name
 * @param {number|string} id - Record ID
 * @returns {Promise} - Delete result
 */
async function remove(table, id) {
  try {
    const result = await query(`DELETE FROM ${table} WHERE id = ?`, [id]);
    return result;
  } catch (error) {
    console.error(`Error deleting from ${table}:`, error);
    throw error;
  }
}

module.exports = {
  getPool,
  query,
  getById,
  insert,
  update,
  remove
}; 