const express = require('express');
const userController = require('../controllers/userController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { userValidationRules, validate, idParamValidation } = require('../middleware/validationMiddleware');
const { uploadSingle } = require('../utils/fileUpload');

const router = express.Router();

/**
 * @route   POST /api/users/register
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  '/register',
  uploadSingle('profile_image'),
  userValidationRules.create,
  validate,
  userController.create
);

/**
 * @route   POST /api/users/login
 * @desc    Login user with phone or email
 * @access  Public
 */
router.post(
  '/login',
  userValidationRules.login,
  validate,
  userController.login
);

/**
 * @route   POST /api/users/logout
 * @desc    Logout user and clear cookies
 * @access  Public
 */
router.post(
  '/logout',
  userController.logout
);

/**
 * @route   GET /api/users/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get(
  '/profile',
  protect,
  userController.getProfile
);

/**
 * @route   PUT /api/users/profile
 * @desc    Update current user profile
 * @access  Private
 */
router.put(
  '/profile',
  protect,
  uploadSingle('profile_image'),
  userValidationRules.update,
  validate,
  userController.updateProfile
);

/**
 * @route   POST /api/users/become-host
 * @desc    Update user to become a host/provider
 * @access  Private
 */
router.post(
  '/become-host',
  protect,
  userController.becomeHost
);

/**
 * @route   GET /api/users
 * @desc    Get all users
 * @access  Private/Admin
 */
router.get(
  '/',
  protect,
  userController.getAll
);

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Private
 */
router.get(
  '/:id',
  protect,
  idParamValidation,
  validate,
  userController.getById
);

/**
 * @route   PUT /api/users/:id
 * @desc    Update user
 * @access  Private
 */
router.put(
  '/:id',
  protect,
  idParamValidation,
  uploadSingle('profile_image'),
  userValidationRules.update,
  validate,
  userController.update
);

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user
 * @access  Private
 */
router.delete(
  '/:id',
  protect,
  idParamValidation,
  validate,
  userController.delete
);

module.exports = router; 