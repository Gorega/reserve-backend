const userModel = require('../models/userModel');
const { getFileUrl, deleteFile, uploadToCloudinary } = require('../utils/fileUpload');
const { badRequest, notFound } = require('../utils/errorHandler');

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
      // Parse query parameters
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const filters = {};
      
      // Add filters if provided
      if (req.query.name) filters.name = req.query.name;
      if (req.query.email) filters.email = req.query.email;
      if (req.query.phone) filters.phone = req.query.phone;
      if (req.query.is_provider !== undefined) {
        filters.is_provider = req.query.is_provider === 'true';
      }
      
      // Get users
      const users = await userModel.getAll(filters, page, limit);
      
      // Count total users for pagination
      const countQuery = await userModel.getAll(filters, 1, Number.MAX_SAFE_INTEGER);
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
          // Upload to Cloudinary
          const cloudinaryResult = await uploadToCloudinary(req.file.path);
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
          // Upload to Cloudinary
          const cloudinaryResult = await uploadToCloudinary(req.file.path);
          userData.profile_image = cloudinaryResult.secure_url;
          
          // Get existing user to delete old profile image from Cloudinary
          const existingUser = await userModel.getById(id);
          if (existingUser.profile_image && existingUser.profile_image.includes('cloudinary.com')) {
            // Extract public_id from Cloudinary URL and delete
            const urlParts = existingUser.profile_image.split('/');
            const filenamePart = urlParts[urlParts.length - 1];
            const filename = filenamePart.split('.')[0]; // Remove extension
            const publicId = `${process.env.CLOUDINARY_FOLDER || 'reserve-app'}/${filename}`;
            await deleteFile(publicId);
          }
        } catch (uploadError) {
          console.error('Error uploading profile image:', uploadError);
          // Delete the local file if upload failed
          if (req.file.path && require('fs').existsSync(req.file.path)) {
            require('fs').unlinkSync(req.file.path);
          }
          return next(badRequest('Failed to upload profile image'));
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
          // Upload to Cloudinary
          const cloudinaryResult = await uploadToCloudinary(req.file.path);
          userData.profile_image = cloudinaryResult.secure_url;
          
          // Delete old profile image from Cloudinary
          if (req.user.profile_image && req.user.profile_image.includes('cloudinary.com')) {
            // Extract public_id from Cloudinary URL and delete
            const urlParts = req.user.profile_image.split('/');
            const filenamePart = urlParts[urlParts.length - 1];
            const filename = filenamePart.split('.')[0]; // Remove extension
            const publicId = `${process.env.CLOUDINARY_FOLDER || 'reserve-app'}/${filename}`;
            await deleteFile(publicId);
          }
        } catch (uploadError) {
          console.error('Error uploading profile image:', uploadError);
          // Delete the local file if upload failed
          if (req.file.path && require('fs').existsSync(req.file.path)) {
            require('fs').unlinkSync(req.file.path);
          }
          return next(badRequest('Failed to upload profile image'));
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

module.exports = userController; 