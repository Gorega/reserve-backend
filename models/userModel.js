const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');
const { unauthorized, notFound, conflict } = require('../utils/errorHandler');
const emailService = require('../utils/emailService');
const { getMessage } = require('../utils/languageUtils');

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
      // Ensure page and limit are numbers
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;
      const offset = (pageNum - 1) * limitNum;
      
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
          params.push(filters.is_provider ? 1 : 0); // Convert boolean to 0/1 for MySQL
        }
        
        if (filterConditions.length > 0) {
          query += ' WHERE ' + filterConditions.join(' AND ');
        }
      }
      
      // Add pagination with direct integer values in the query string instead of parameters
      query += ` LIMIT ${parseInt(limitNum, 10)} OFFSET ${parseInt(offset, 10)}`;
      
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
   * @param {string} language - Language code for error messages
   * @returns {Promise<Object>} - User object
   */
  async getById(id, language = 'ar') {
    try {
      const user = await db.getById('users', id);
      
      if (!user) {
        throw notFound(getMessage('USER_NOT_FOUND', language));
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
   * @param {string} language - Language code for error messages
   * @returns {Promise<Object>} - Created user
   */
  async create(userData, language = 'ar') {
    try {
      // Check if phone is provided
      if (!userData.phone) {
        throw conflict(getMessage('PHONE_REQUIRED', language));
      }
      
      // Check if phone already exists
      const existingPhone = await this.getByPhone(userData.phone);
      if (existingPhone) {
        throw conflict(getMessage('PHONE_ALREADY_IN_USE', language));
      }
      
      // Check if email already exists (if provided)
      if (userData.email) {
        const existingEmail = await this.getByEmail(userData.email);
        if (existingEmail) {
          throw conflict(getMessage('EMAIL_ALREADY_IN_USE', language));
        }
      }
      
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(userData.password, salt);
      
      // Generate verification token if email is provided
      let verificationToken = null;
      let verificationTokenExpires = null;
      
      if (userData.email) {
        verificationToken = crypto.randomBytes(32).toString('hex');
        // Set expiration to 24 hours from now
        verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      }
      
      // Prepare user data for insertion
      const newUser = {
        name: userData.name,
        email: userData.email || null,
        password_hash: hashedPassword,
        phone: userData.phone,
        profile_image: userData.profile_image || null,
        is_provider: userData.is_provider || false,
        email_verified: false, // Always false for new users
        verification_token: verificationToken,
        verification_token_expires: verificationTokenExpires,
        verification_sent_at: userData.email ? new Date() : null
      };
      
      // Insert user
      const result = await db.insert('users', newUser);
      
      // Get created user
      const createdUser = await this.getById(result.insertId, language);
      
      // Send verification email if email is provided
      if (userData.email && verificationToken) {
        try {
          const emailSent = await emailService.sendVerificationEmail(
            userData.email,
            userData.name,
            verificationToken,
            userData.language || 'ar'
          );
          
        } catch (emailError) {
          console.error('Error sending verification email:', emailError);
          // Don't throw error here - user creation should succeed even if email fails
        }
      }
      
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
   * @param {string} language - Language code for error messages
   * @returns {Promise<Object>} - Updated user
   */
  async update(id, userData, language = 'ar') {
    try {
      // Check if user exists
      const user = await this.getById(id, language);
      
      // Check if email is being changed and if it's already in use
      if (userData.email !== undefined && userData.email !== user.email) {
        if (userData.email) {
          const existingUser = await this.getByEmail(userData.email);
          if (existingUser) {
            throw conflict(getMessage('EMAIL_ALREADY_IN_USE', language));
          }
        }
      }
      
      // Check if phone is being changed and if it's already in use
      if (userData.phone && userData.phone !== user.phone) {
        const existingUser = await this.getByPhone(userData.phone);
        if (existingUser) {
          throw conflict(getMessage('PHONE_ALREADY_IN_USE', language));
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
      const updatedUser = await this.getById(id, language);
      
      return updatedUser;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  },
  
  /**
   * Delete a user
   * @param {number} id - User ID
   * @param {string} language - Language code for error messages
   * @returns {Promise<boolean>} - Success status
   */
  async delete(id, language = 'ar') {
    try {
      // Check if user exists
      await this.getById(id, language);
      
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
   * @param {string} language - Language code for error messages
   * @returns {Promise<Object>} - User object with token
   */
  async login(identifier, password, res, language = 'ar') {
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
        throw unauthorized(getMessage('INVALID_CREDENTIALS', language));
      }
      
      // Check if password is correct
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        throw unauthorized(getMessage('INVALID_CREDENTIALS', language));
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
   * Make user a host/provider
   * @param {number} userId - User ID
   * @param {string} language - Language code for error messages
   * @returns {Promise<Object>} - Updated user
   */
  async becomeHost(userId, language = 'ar') {
    try {
      // Check if user exists
      const user = await this.getById(userId, language);
      
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
      const updatedUser = await this.getById(userId, language);
      
      return updatedUser;
    } catch (error) {
      console.error('Error becoming host:', error);
      throw error;
    }
  },
  
  /**
   * Verify user email with token
   * @param {string} token - Verification token
   * @returns {Promise<Object>} - Verified user
   */
  async verifyEmail(token, language = 'ar') {
    try {
      // Find user by verification token
      const users = await db.query(
        'SELECT * FROM users WHERE verification_token = ? AND verification_token_expires > NOW()',
        [token]
      );
      
      if (users.length === 0) {
        throw unauthorized(getMessage('INVALID_OR_EXPIRED_TOKEN', language));
      }
      
      const user = users[0];
      
      // Update user to mark email as verified
      await db.update('users', user.id, {
        email_verified: true,
        verification_token: null,
        verification_token_expires: null
      });
      
      // Send welcome email
      try {
        await emailService.sendWelcomeEmail(user.email, user.name, language);
      } catch (emailError) {
        console.error('Error sending welcome email:', emailError);
        // Don't throw error - verification should succeed even if welcome email fails
      }
      
      // Get updated user
      const verifiedUser = await this.getById(user.id, language);
      
      return verifiedUser;
    } catch (error) {
      console.error('Error verifying email:', error);
      throw error;
    }
  },

  /**
   * Resend verification email
   * @param {string} email - User email
   * @returns {Promise<boolean>} - Success status
   */
  async resendVerificationEmail(email, language = 'ar') {
    try {
      // Find user by email
      const user = await this.getByEmail(email);
      
      if (!user) {
        throw notFound(getMessage('USER_NOT_FOUND', language));
      }
      
      // Check if email is already verified
      if (user.email_verified) {
        throw conflict(getMessage('EMAIL_ALREADY_VERIFIED', language));
      }
      
      // Generate new verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      
      // Update user with new token
      await db.update('users', user.id, {
        verification_token: verificationToken,
        verification_token_expires: verificationTokenExpires,
        verification_sent_at: new Date()
      });
      
      // Send verification email
      const emailSent = await emailService.sendVerificationEmail(
        user.email,
        user.name,
        verificationToken,
        language
      );
      
      if (!emailSent) {
        throw new Error(getMessage('FAILED_TO_SEND_VERIFICATION_EMAIL', language));
      }
      
      return true;
    } catch (error) {
      console.error('Error resending verification email:', error);
      throw error;
    }
  },

  /**
   * Get user by verification token
   * @param {string} token - Verification token
   * @returns {Promise<Object>} - User object
   */
  async getByVerificationToken(token) {
    try {
      const users = await db.query(
        'SELECT * FROM users WHERE verification_token = ? AND verification_token_expires > NOW()',
        [token]
      );
      
      if (users.length === 0) {
        return null;
      }
      
      return users[0];
    } catch (error) {
      console.error('Error getting user by verification token:', error);
      throw error;
    }
  },

  /**
   * Generate password reset verification code
   * @param {string} email - User email
   * @param {string} language - Language for email template
   * @returns {Promise<boolean>} - Success status
   */
  async generatePasswordResetCode(email, language = 'ar') {
    try {
      // Find user by email
      const user = await this.getByEmail(email);
      
      if (!user) {
        throw notFound(getMessage('USER_NOT_FOUND', language));
      }
      
      // Generate a 6-digit verification code
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Set expiration time (15 minutes from now)
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      
      // Store verification code in database
      await db.update('users', user.id, {
        reset_code: verificationCode,
        reset_code_expires: expiresAt
      });
      
      // Send verification code email
      const emailSent = await emailService.sendPasswordResetCodeEmail(
        user.email,
        user.name,
        verificationCode,
        language
      );
      
      if (!emailSent) {
        throw new Error(getMessage('FAILED_TO_SEND_RESET_EMAIL', language));
      }
      
      return true;
    } catch (error) {
      console.error('Error in generating password reset code:', error);
      throw error;
    }
  },

  /**
   * Verify password reset code
   * @param {string} email - User email
   * @param {string} code - Verification code
   * @param {string} language - Language code for error messages
   * @returns {Promise<Object>} - User data if code is valid
   */
  async verifyPasswordResetCode(email, code, language = 'ar') {
    try {
      // Find user by email
      const user = await this.getByEmail(email);
      
      if (!user) {
        throw notFound(getMessage('USER_NOT_FOUND', language));
      }
      
      // Check if code exists and hasn't expired
      if (!user.reset_code || !user.reset_code_expires) {
        throw unauthorized(getMessage('NO_PASSWORD_RESET_CODE', language));
      }
      
      if (new Date() > new Date(user.reset_code_expires)) {
        throw unauthorized(getMessage('PASSWORD_RESET_CODE_EXPIRED', language));
      }
      
      if (user.reset_code !== code) {
        throw unauthorized(getMessage('INVALID_RESET_CODE', language));
      }
      
      return user;
    } catch (error) {
      console.error('Error in verifying password reset code:', error);
      throw error;
    }
  },

  /**
   * Reset password with verification code
   * @param {string} email - User email
   * @param {string} code - Verification code
   * @param {string} newPassword - New password
   * @param {string} language - Language code for error messages
   * @returns {Promise<boolean>} - Success status
   */
  async resetPasswordWithCode(email, code, newPassword, language = 'ar') {
    try {
      // Verify the code first
      const user = await this.verifyPasswordResetCode(email, code, language);
      
      // Hash the new password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      
      // Update user with new password and clear reset code
      await db.update('users', user.id, {
        password_hash: hashedPassword,
        reset_code: null,
        reset_code_expires: null
      });
      
      return true;
    } catch (error) {
      console.error('Error in resetting password:', error);
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