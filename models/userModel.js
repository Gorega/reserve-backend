const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { unauthorized, notFound, conflict } = require('../utils/errorHandler');

/**
 * User Model
 * Handles all database operations for the users table
 */
const userModel = {
  /**
   * Get all users with optional filtering
   * @param {Object} filters - Optional filters
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Array>} - List of users
   */
  async getAll(filters = {}, page = 1, limit = 10) {
    try {
      const offset = (page - 1) * limit;
      let query = 'SELECT id, name, email, phone, profile_image, is_provider, created_at FROM users';
      const params = [];
      
      // Add filters if provided
      if (Object.keys(filters).length > 0) {
        const filterConditions = [];
        
        if (filters.name) {
          filterConditions.push('name LIKE ?');
          params.push(`%${filters.name}%`);
        }
        
        if (filters.email) {
          filterConditions.push('email LIKE ?');
          params.push(`%${filters.email}%`);
        }
        
        if (filters.phone) {
          filterConditions.push('phone LIKE ?');
          params.push(`%${filters.phone}%`);
        }
        
        if (filters.is_provider !== undefined) {
          filterConditions.push('is_provider = ?');
          params.push(filters.is_provider);
        }
        
        if (filterConditions.length > 0) {
          query += ' WHERE ' + filterConditions.join(' AND ');
        }
      }
      
      // Add pagination
      query += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      const users = await db.query(query, params);
      return users;
    } catch (error) {
      console.error('Error getting users:', error);
      throw error;
    }
  },
  
  /**
   * Get user by ID
   * @param {number} id - User ID
   * @returns {Promise<Object>} - User object
   */
  async getById(id) {
    try {
      const user = await db.getById('users', id);
      
      if (!user) {
        throw notFound('User not found');
      }
      
      // Remove sensitive data
      delete user.password_hash;
      
      return user;
    } catch (error) {
      console.error('Error getting user by ID:', error);
      throw error;
    }
  },
  
  /**
   * Get user by email
   * @param {string} email - User email
   * @returns {Promise<Object>} - User object
   */
  async getByEmail(email) {
    try {
      const users = await db.query('SELECT * FROM users WHERE email = ?', [email]);
      
      if (users.length === 0) {
        return null;
      }
      
      return users[0];
    } catch (error) {
      console.error('Error getting user by email:', error);
      throw error;
    }
  },

  /**
   * Get user by phone
   * @param {string} phone - User phone
   * @returns {Promise<Object>} - User object
   */
  async getByPhone(phone) {
    try {
      const users = await db.query('SELECT * FROM users WHERE phone = ?', [phone]);
      
      if (users.length === 0) {
        return null;
      }
      
      return users[0];
    } catch (error) {
      console.error('Error getting user by phone:', error);
      throw error;
    }
  },
  
  /**
   * Create a new user
   * @param {Object} userData - User data
   * @returns {Promise<Object>} - Created user
   */
  async create(userData) {
    try {
      // Check if phone is provided
      if (!userData.phone) {
        throw conflict('Phone number is required');
      }
      
      // Check if phone already exists
      const existingPhone = await this.getByPhone(userData.phone);
      if (existingPhone) {
        throw conflict('Phone number already in use');
      }
      
      // Check if email already exists (if provided)
      if (userData.email) {
        const existingEmail = await this.getByEmail(userData.email);
        if (existingEmail) {
          throw conflict('Email already in use');
        }
      }
      
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(userData.password, salt);
      
      // Prepare user data for insertion
      const newUser = {
        name: userData.name,
        email: userData.email || null,
        password_hash: hashedPassword,
        phone: userData.phone,
        profile_image: userData.profile_image || null,
        is_provider: userData.is_provider || false
      };
      
      // Insert user
      const result = await db.insert('users', newUser);
      
      // Get created user
      const createdUser = await this.getById(result.insertId);
      
      return createdUser;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  },
  
  /**
   * Update a user
   * @param {number} id - User ID
   * @param {Object} userData - User data to update
   * @returns {Promise<Object>} - Updated user
   */
  async update(id, userData) {
    try {
      // Check if user exists
      const user = await this.getById(id);
      
      // Check if email is being changed and if it's already in use
      if (userData.email !== undefined && userData.email !== user.email) {
        if (userData.email) {
          const existingUser = await this.getByEmail(userData.email);
          if (existingUser) {
            throw conflict('Email already in use');
          }
        }
      }
      
      // Check if phone is being changed and if it's already in use
      if (userData.phone && userData.phone !== user.phone) {
        const existingUser = await this.getByPhone(userData.phone);
        if (existingUser) {
          throw conflict('Phone number already in use');
        }
      }
      
      // Prepare update data
      const updateData = {};
      
      // Only include fields that are provided
      if (userData.name !== undefined) updateData.name = userData.name;
      if (userData.email !== undefined) updateData.email = userData.email || null;
      if (userData.phone !== undefined) updateData.phone = userData.phone;
      if (userData.profile_image !== undefined) updateData.profile_image = userData.profile_image;
      if (userData.is_provider !== undefined) updateData.is_provider = userData.is_provider;
      
      // Update password if provided
      if (userData.password) {
        const salt = await bcrypt.genSalt(10);
        updateData.password_hash = await bcrypt.hash(userData.password, salt);
      }
      
      // Update user
      await db.update('users', id, updateData);
      
      // Get updated user
      const updatedUser = await this.getById(id);
      
      return updatedUser;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  },
  
  /**
   * Delete a user
   * @param {number} id - User ID
   * @returns {Promise<boolean>} - Success status
   */
  async delete(id) {
    try {
      // Check if user exists
      await this.getById(id);
      
      // Delete user
      await db.remove('users', id);
      
      return true;
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  },
  
  /**
   * Authenticate user
   * @param {string} identifier - User email or phone
   * @param {string} password - User password
   * @param {Object} res - Express response object for setting cookies
   * @returns {Promise<Object>} - User object with token
   */
  async login(identifier, password, res) {
    try {
      // Check if identifier is email or phone
      let user = null;
      
      // Try to find user by phone first (primary login method)
      user = await this.getByPhone(identifier);
      
      // If not found by phone, try email
      if (!user && identifier.includes('@')) {
        user = await this.getByEmail(identifier);
      }
      
      // Check if user exists
      if (!user) {
        throw unauthorized('Invalid credentials');
      }
      
      // Check if password is correct
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        throw unauthorized('Invalid credentials');
      }
      
      // Generate JWT token
      const token = this.generateToken(user.id);
      
      // Set cookies if response object is provided
      if (res) {
        const isProduction = process.env.NODE_ENV === 'production';
        const cookieOptions = {
          httpOnly: true,
          secure: isProduction,
          sameSite: isProduction ? 'none' : 'lax',
          path: "/",
          maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
        };

        // Set HTTP-only cookie for token
        res.cookie("token", token, cookieOptions);

        // Set non-HTTP-only cookie for frontend checks
        res.cookie("signed", true, {
          ...cookieOptions,
          httpOnly: false
        });
      }
      
      // Remove sensitive data
      delete user.password_hash;
      
      return {
        ...user,
        token
      };
    } catch (error) {
      console.error('Error logging in:', error);
      throw error;
    }
  },
  
  /**
   * Update user to become a host/provider
   * @param {number} userId - User ID
   * @returns {Promise<Object>} - Updated user
   */
  async becomeHost(userId) {
    try {
      // Check if user exists
      const user = await this.getById(userId);
      
      // If user is already a provider, just return the user
      if (user.is_provider) {
        return user;
      }
      
      // Update user to become a provider
      const updateData = {
        is_provider: true
      };
      
      // Update user
      await db.update('users', userId, updateData);
      
      // Get updated user
      const updatedUser = await this.getById(userId);
      
      return updatedUser;
    } catch (error) {
      console.error('Error becoming host:', error);
      throw error;
    }
  },
  
  /**
   * Generate JWT token
   * @param {number} userId - User ID
   * @returns {string} - JWT token
   */
  generateToken(userId) {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });
  }
};

module.exports = userModel; 