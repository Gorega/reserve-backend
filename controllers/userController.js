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