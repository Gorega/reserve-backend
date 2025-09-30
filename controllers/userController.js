const userModel = require('../models/userModel');
const { getFileUrl, deleteFile, uploadToCloudinary, uploadSingle } = require('../utils/fileUpload');
const { badRequest, notFound } = require('../utils/errorHandler');
const path = require('path');

/**
 * User Controller
 * Handles HTTP requests for user operations
 */
const userController = {
  /**
   * Get all users
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getAll(req, res, next) {
    try {
      // Parse query parameters with explicit type conversion
      const page = parseInt(req.query.page, 10) || 1;
      // Limit the maximum number of records to prevent performance issues
      const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
      const filters = {};
      
      // Add filters if provided
      if (req.query.name) filters.name = String(req.query.name);
      if (req.query.email) filters.email = String(req.query.email);
      if (req.query.phone) filters.phone = String(req.query.phone);
      if (req.query.is_provider !== undefined) {
        // Convert string 'true'/'false' to boolean
        filters.is_provider = req.query.is_provider === 'true';
      }
      
      // Log the parameters for debugging
      console.log('Controller parameters:', { page, limit, filters });
      
      // Get users with explicit number parameters
      const users = await userModel.getAll(filters, Number(page), Number(limit));
      
      // Count total users for pagination with safe parameters
      // Use a reasonable limit for counting to prevent performance issues
      const countQuery = await userModel.getAll(filters, 1, 1000);
      const totalCount = countQuery.length;
      
      res.status(200).json({
        status: 'success',
        results: users.length,
        totalCount,
        page,
        totalPages: Math.ceil(totalCount / limit),
        data: users
      });
    } catch (error) {
      console.error('Controller error in getAll:', error);
      next(error);
    }
  },
  
  /**
   * Get user by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const user = await userModel.getById(id);
      
      res.status(200).json({
        status: 'success',
        data: user
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Get current user profile
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getProfile(req, res, next) {
    try {
      // User is already set in req.user by the auth middleware
      res.status(200).json({
        status: 'success',
        data: req.user
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Create a new user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async create(req, res, next) {
    try {
      const userData = req.body;
      
      // Handle file upload if present
      if (req.file) {
        try {
          // Upload to Cloudinary with optimizations
          const cloudinaryResult = await uploadToCloudinary(req.file.path, {
            folder: `${process.env.CLOUDINARY_FOLDER || 'reserve-app'}/users`,
            transformation: [
              { width: 500, height: 500, crop: 'limit' },
              { quality: 'auto' }
            ]
          });
          userData.profile_image = cloudinaryResult.secure_url;
        } catch (uploadError) {
          console.error('Error uploading profile image:', uploadError);
          // Delete the local file if upload failed
          if (req.file.path && require('fs').existsSync(req.file.path)) {
            require('fs').unlinkSync(req.file.path);
          }
          return next(badRequest('Failed to upload profile image'));
        }
      }
      
      const user = await userModel.create(userData);
      
      res.status(201).json({
        status: 'success',
        data: user
      });
    } catch (error) {
      // Delete uploaded file if there was an error
      if (req.file && req.file.path && require('fs').existsSync(req.file.path)) {
        require('fs').unlinkSync(req.file.path);
      }
      next(error);
    }
  },
  
  /**
   * Update a user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const userData = req.body;
      
      // Handle file upload if present
      if (req.file) {
        try {
          // Upload to Cloudinary with user-specific folder
          const cloudinaryResult = await uploadToCloudinary(req.file.path, {
            folder: `${process.env.CLOUDINARY_FOLDER || 'reserve-app'}/users`,
            public_id: `user_${id}_${Date.now()}`,
            transformation: [
              { width: 500, height: 500, crop: 'limit' },
              { quality: 'auto' }
            ]
          });
          
          userData.profile_image = cloudinaryResult.secure_url;
          
          // Get existing user to delete old profile image from Cloudinary
          const existingUser = await userModel.getById(id);
          if (existingUser.profile_image && existingUser.profile_image.includes('cloudinary.com')) {
            try {
              await deleteFile(existingUser.profile_image);
            } catch (deleteError) {
              console.error('Error deleting old profile image:', deleteError);
              // Continue with the update even if deletion fails
            }
          }
        } catch (uploadError) {
          console.error('Error uploading profile image:', uploadError);
          // Delete the local file if upload failed
          if (req.file.path && require('fs').existsSync(req.file.path)) {
            require('fs').unlinkSync(req.file.path);
          }
          return next(badRequest('Failed to upload profile image'));
        }
      } else if (userData.profile_image === null) {
        // If profile_image is explicitly set to null, remove the profile image
        const existingUser = await userModel.getById(id);
        if (existingUser.profile_image && existingUser.profile_image.includes('cloudinary.com')) {
          try {
            await deleteFile(existingUser.profile_image);
          } catch (deleteError) {
            console.error('Error deleting profile image:', deleteError);
            // Continue with the update even if deletion fails
          }
        }
      }
      
      const user = await userModel.update(id, userData);
      
      res.status(200).json({
        status: 'success',
        data: user
      });
    } catch (error) {
      // Delete uploaded file if there was an error
      if (req.file && req.file.path && require('fs').existsSync(req.file.path)) {
        require('fs').unlinkSync(req.file.path);
      }
      next(error);
    }
  },
  
  /**
   * Update current user profile
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updateProfile(req, res, next) {
    try {
      const userData = req.body;
      
      // Handle file upload if present
      if (req.file) {
        try {
          // Upload to Cloudinary with user-specific folder
          const cloudinaryResult = await uploadToCloudinary(req.file.path, {
            folder: `${process.env.CLOUDINARY_FOLDER || 'reserve-app'}/users`,
            public_id: `user_${req.user.id}_${Date.now()}`,
            transformation: [
              { width: 500, height: 500, crop: 'limit' },
              { quality: 'auto' }
            ]
          });
          
          userData.profile_image = cloudinaryResult.secure_url;
          
          // Delete old profile image from Cloudinary
          if (req.user.profile_image && req.user.profile_image.includes('cloudinary.com')) {
            try {
              await deleteFile(req.user.profile_image);
            } catch (deleteError) {
              console.error('Error deleting old profile image:', deleteError);
              // Continue with the update even if deletion fails
            }
          }
        } catch (uploadError) {
          console.error('Error uploading profile image:', uploadError);
          // Delete the local file if upload failed
          if (req.file.path && require('fs').existsSync(req.file.path)) {
            require('fs').unlinkSync(req.file.path);
          }
          return next(badRequest('Failed to upload profile image'));
        }
      } else if (userData.profile_image === null) {
        // If profile_image is explicitly set to null, remove the profile image
        if (req.user.profile_image && req.user.profile_image.includes('cloudinary.com')) {
          try {
            await deleteFile(req.user.profile_image);
          } catch (deleteError) {
            console.error('Error deleting profile image:', deleteError);
            // Continue with the update even if deletion fails
          }
        }
      }
      
      const user = await userModel.update(req.user.id, userData);
      
      res.status(200).json({
        status: 'success',
        data: user
      });
    } catch (error) {
      // Delete uploaded file if there was an error
      if (req.file && req.file.path && require('fs').existsSync(req.file.path)) {
        require('fs').unlinkSync(req.file.path);
      }
      next(error);
    }
  },
  
  /**
   * Delete a user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async delete(req, res, next) {
    try {
      const { id } = req.params;
      
      // Get user to delete profile image
      const user = await userModel.getById(id);
      
      await userModel.delete(id);
      
      // Delete profile image if exists
      if (user.profile_image) {
        const filename = user.profile_image.split('/').pop();
        deleteFile(filename);
      }
      
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * User login
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async login(req, res, next) {
    try {
      const { identifier, password } = req.body;
      
      if (!identifier) {
        return res.status(400).json({
          status: 'error',
          message: 'Phone number or email is required'
        });
      }
      
      const user = await userModel.login(identifier, password, res);
      
      res.status(200).json({
        status: 'success',
        data: user
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * User logout
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async logout(req, res, next) {
    try {
      // Clear cookies
      res.clearCookie('token', {
        httpOnly: true,
        path: '/'
      });
      
      res.clearCookie('signed', {
        path: '/'
      });
      
      res.status(200).json({
        status: 'success',
        message: 'Logged out successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update user to become a host/provider
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async becomeHost(req, res, next) {
    try {
      // Get current user ID from auth middleware
      const userId = req.user.id;
      
      // Update user to become a provider
      const updatedUser = await userModel.becomeHost(userId);
      
      res.status(200).json({
        status: 'success',
        data: updatedUser
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Verify user email with token
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async verifyEmail(req, res, next) {
    try {
      const { token } = req.params;
      const { language } = req.query; // Get language from query parameters
      
      if (!token) {
        return res.status(400).json({
          status: 'error',
          message: 'Verification token is required'
        });
      }
      
      const user = await userModel.verifyEmail(token, language || 'ar');
      
      res.status(200).json({
        status: 'success',
        message: 'Email verified successfully! Welcome to our platform.',
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            email_verified: user.email_verified
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Resend verification email
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async resendVerificationEmail(req, res, next) {
    try {
      const { email, language } = req.body;
      
      if (!email) {
        return res.status(400).json({
          status: 'error',
          message: 'Email address is required'
        });
      }
      
      const success = await userModel.resendVerificationEmail(email, language || 'ar');
      
      if (success) {
        res.status(200).json({
          status: 'success',
          message: 'Verification email sent successfully. Please check your inbox.'
        });
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Failed to send verification email. Please try again later.'
        });
      }
    } catch (error) {
      next(error);
    }
  },

  /**
   * Generate password reset verification code
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async generatePasswordResetCode(req, res, next) {
    try {
      const { email, language } = req.body;
      
      if (!email) {
        return res.status(400).json({
          status: 'error',
          message: 'Email address is required'
        });
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          status: 'error',
          message: 'Please enter a valid email address'
        });
      }
      
      const success = await userModel.generatePasswordResetCode(email.toLowerCase().trim(), language || 'ar');
      
      if (success) {
        res.status(200).json({
          status: 'success',
          message: 'A verification code has been sent to your email address. Please check your inbox and enter the code to reset your password.'
        });
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Failed to send verification code. Please try again later.'
        });
      }
    } catch (error) {
      next(error);
    }
  },

  /**
   * Verify password reset code
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async verifyPasswordResetCode(req, res, next) {
    try {
      const { email, code } = req.body;
      
      if (!email || !code) {
        return res.status(400).json({
          status: 'error',
          message: 'Email and verification code are required'
        });
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          status: 'error',
          message: 'Please enter a valid email address'
        });
      }

      // Validate code format (6 digits)
      if (!/^\d{6}$/.test(code)) {
        return res.status(400).json({
          status: 'error',
          message: 'Verification code must be 6 digits'
        });
      }
      
      const user = await userModel.verifyPasswordResetCode(email.toLowerCase().trim(), code);
      
      if (user) {
        res.status(200).json({
          status: 'success',
          message: 'Verification code is valid. You can now set a new password.'
        });
      }
    } catch (error) {
      next(error);
    }
  },

  /**
   * Reset password with verification code
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async resetPasswordWithCode(req, res, next) {
    try {
      const { email, code, newPassword } = req.body;
      
      if (!email || !code || !newPassword) {
        return res.status(400).json({
          status: 'error',
          message: 'Email, verification code, and new password are required'
        });
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          status: 'error',
          message: 'Please enter a valid email address'
        });
      }

      // Validate code format (6 digits)
      if (!/^\d{6}$/.test(code)) {
        return res.status(400).json({
          status: 'error',
          message: 'Verification code must be 6 digits'
        });
      }

      // Validate password strength
      if (newPassword.length < 6) {
        return res.status(400).json({
          status: 'error',
          message: 'Password must be at least 6 characters long'
        });
      }
      
      const success = await userModel.resetPasswordWithCode(
        email.toLowerCase().trim(), 
        code, 
        newPassword
      );
      
      if (success) {
        res.status(200).json({
          status: 'success',
          message: 'Password has been reset successfully. You can now log in with your new password.'
        });
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Failed to reset password. Please try again.'
        });
      }
    } catch (error) {
      next(error);
    }
  }
};

/**
 * Update user profile image
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const updateProfileImage = async (req, res, next) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No image file provided'
      });
    }

    // Upload to Cloudinary with user-specific folder
    const cloudinaryResult = await uploadToCloudinary(req.file.path, {
      folder: `${process.env.CLOUDINARY_FOLDER || 'reserve-app'}/users`,
      public_id: `user_${req.user.id}_${Date.now()}`,
      transformation: [
        { width: 500, height: 500, crop: 'limit' },
        { quality: 'auto' }
      ]
    });

    // Delete old profile image from Cloudinary if exists
    if (req.user.profile_image && req.user.profile_image.includes('cloudinary.com')) {
      try {
        await deleteFile(req.user.profile_image);
      } catch (deleteError) {
        console.error('Error deleting old profile image:', deleteError);
        // Continue with the update even if deletion fails
      }
    }

    // Update user profile with new image URL
    const userData = { profile_image: cloudinaryResult.secure_url };
    const updatedUser = await userModel.update(req.user.id, userData);

    res.status(200).json({
      status: 'success',
      data: updatedUser
    });
  } catch (error) {
    // Delete uploaded file if there was an error
    if (req.file && req.file.path && require('fs').existsSync(req.file.path)) {
      require('fs').unlinkSync(req.file.path);
    }
    next(error);
  }
};

// Middleware for handling profile image uploads
const handleProfileImageUpload = uploadSingle('profile_image');

module.exports = {
  ...userController,
  handleProfileImageUpload,
  updateProfileImage
};