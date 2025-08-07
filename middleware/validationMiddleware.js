const { body, param, query, validationResult } = require('express-validator');
const { validationError } = require('../utils/errorHandler');

/**
 * Middleware to validate request data using express-validator
 * Returns validation errors if any
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.path,
      message: error.msg
    }));
    
    return next(validationError({
      message: 'Validation failed',
      errors: errorMessages
    }));
  }
  next();
};

/**
 * User validation rules
 */
const userValidationRules = {
  // Create user validation rules
  create: [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email')
      .optional()
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail(),
    body('phone')
      .trim()
      .notEmpty()
      .withMessage('Phone number is required')
      .matches(/^\+?[0-9]{10,15}$/)
      .withMessage('Please provide a valid phone number'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long'),
    body('is_provider').optional().isBoolean().withMessage('Provider status must be boolean'),
    body('profile_image').optional().isURL().withMessage('Profile image must be a valid URL')
  ],

  // Login validation rules
  login: [
    body('identifier')
      .trim()
      .notEmpty()
      .withMessage('Phone number or email is required'),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ],

  // Update user validation rules
  update: [
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('email')
      .optional({ nullable: true })
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail(),
    body('phone')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Phone number cannot be empty')
      .matches(/^\+?[0-9]{10,15}$/)
      .withMessage('Please provide a valid phone number'),
    body('password')
      .optional()
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long'),
    body('is_provider').optional().isBoolean().withMessage('Provider status must be boolean'),
    body('profile_image').optional().isURL().withMessage('Profile image must be a valid URL')
  ]
};

/**
 * Listing validation rules
 */
const listingValidationRules = {
  create: [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('description').trim().notEmpty().withMessage('Description is required'),
    body('category_id').isInt().withMessage('Category ID must be an integer'),
    body('price_per_hour').optional(),
    body('price_per_day').optional(),
    body('price_per_half_night').optional(),
    body('unit_type').optional().isIn(['hour', 'day', 'session', 'night']).withMessage('Invalid unit type'),
    body('is_hourly').optional().isBoolean().withMessage('Is hourly must be a boolean value'),
    body('location').trim().notEmpty().withMessage('Location is required'),
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
    body('instant_booking').optional().isBoolean().withMessage('Instant booking must be a boolean value'),
    body('cancellation_policy')
      .optional()
      .isIn(['flexible', 'moderate', 'strict', 'non_refundable'])
      .withMessage('Invalid cancellation policy'),
    
    // Property details validation (for accommodations)
    body('property_details.max_guests').optional().isInt({ min: 1 }).withMessage('Maximum guests must be at least 1'),
    body('property_details.bedrooms').optional().isInt({ min: 0 }).withMessage('Bedrooms must be a non-negative integer'),
    body('property_details.beds').optional().isInt({ min: 1 }).withMessage('Beds must be at least 1'),
    body('property_details.bathrooms').optional().isFloat({ min: 0 }).withMessage('Bathrooms must be a non-negative number'),
    body('property_details.property_type').optional().notEmpty().withMessage('Property type cannot be empty'),
    body('property_details.room_type').optional().notEmpty().withMessage('Room type cannot be empty'),
    body('property_details.min_nights').optional().isInt({ min: 1 }).withMessage('Minimum nights must be at least 1'),
    body('property_details.max_nights').optional().isInt({ min: 1 }).withMessage('Maximum nights must be at least 1'),
    
    // Car details validation (for car rentals)
    body('car_details.brand').optional().notEmpty().withMessage('Car brand cannot be empty'),
    body('car_details.model').optional().notEmpty().withMessage('Car model cannot be empty'),
    body('car_details.year').optional().isInt({ min: 1900, max: new Date().getFullYear() + 1 }).withMessage('Invalid car year'),
    body('car_details.transmission').optional().isIn(['automatic', 'manual']).withMessage('Invalid transmission type'),
    body('car_details.seats').optional().isInt({ min: 1 }).withMessage('Seats must be at least 1'),
    body('car_details.fuel_type').optional().notEmpty().withMessage('Fuel type cannot be empty'),
    body('car_details.mileage').optional().isInt({ min: 0 }).withMessage('Mileage must be a non-negative integer'),
    
    // Service details validation (for services)
    body('service_details.service_duration').optional().isInt({ min: 1 }).withMessage('Service duration must be at least 1 minute'),
    body('service_details.preparation_time').optional().isInt({ min: 0 }).withMessage('Preparation time must be a non-negative integer'),
    body('service_details.cleanup_time').optional().isInt({ min: 0 }).withMessage('Cleanup time must be a non-negative integer'),
    body('service_details.brings_equipment').optional().isBoolean().withMessage('Brings equipment must be a boolean value'),
    body('service_details.remote_service').optional().isBoolean().withMessage('Remote service must be a boolean value'),
    body('service_details.experience_years').optional().isInt({ min: 0 }).withMessage('Experience years must be a non-negative integer')
  ],
  update: [
    body('title').optional().trim().notEmpty().withMessage('Title cannot be empty'),
    body('description').optional().trim().notEmpty().withMessage('Description cannot be empty'),
    body('category_id').optional().isInt().withMessage('Category ID must be an integer'),
    body('price_per_hour').optional(),
    body('price_per_day').optional(),
    body('price_per_half_night').optional(),
    body('unit_type').optional().isIn(['hour', 'day', 'session', 'night']).withMessage('Invalid unit type'),
    body('is_hourly').optional().isBoolean().withMessage('Is hourly must be a boolean value'),
    body('location').optional().trim().notEmpty().withMessage('Location cannot be empty'),
    body('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
    body('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
    body('instant_booking').optional().isBoolean().withMessage('Instant booking must be a boolean value'),
    body('cancellation_policy')
      .optional()
      .isIn(['flexible', 'moderate', 'strict', 'non_refundable'])
      .withMessage('Invalid cancellation policy'),
    body('active').optional().isBoolean().withMessage('Active must be a boolean value'),
    
    // Property details validation (for accommodations)
    body('property_details.max_guests').optional().isInt({ min: 1 }).withMessage('Maximum guests must be at least 1'),
    body('property_details.bedrooms').optional().isInt({ min: 0 }).withMessage('Bedrooms must be a non-negative integer'),
    body('property_details.beds').optional().isInt({ min: 1 }).withMessage('Beds must be at least 1'),
    body('property_details.bathrooms').optional().isFloat({ min: 0 }).withMessage('Bathrooms must be a non-negative number'),
    body('property_details.property_type').optional().notEmpty().withMessage('Property type cannot be empty'),
    body('property_details.room_type').optional().notEmpty().withMessage('Room type cannot be empty'),
    body('property_details.min_nights').optional().isInt({ min: 1 }).withMessage('Minimum nights must be at least 1'),
    body('property_details.max_nights').optional().isInt({ min: 1 }).withMessage('Maximum nights must be at least 1'),
    
    // Car details validation (for car rentals)
    body('car_details.brand').optional().notEmpty().withMessage('Car brand cannot be empty'),
    body('car_details.model').optional().notEmpty().withMessage('Car model cannot be empty'),
    body('car_details.year').optional().isInt({ min: 1900, max: new Date().getFullYear() + 1 }).withMessage('Invalid car year'),
    body('car_details.transmission').optional().isIn(['automatic', 'manual']).withMessage('Invalid transmission type'),
    body('car_details.seats').optional().isInt({ min: 1 }).withMessage('Seats must be at least 1'),
    body('car_details.fuel_type').optional().notEmpty().withMessage('Fuel type cannot be empty'),
    body('car_details.mileage').optional().isInt({ min: 0 }).withMessage('Mileage must be a non-negative integer'),
    
    // Service details validation (for services)
    body('service_details.service_duration').optional().isInt({ min: 1 }).withMessage('Service duration must be at least 1 minute'),
    body('service_details.preparation_time').optional().isInt({ min: 0 }).withMessage('Preparation time must be a non-negative integer'),
    body('service_details.cleanup_time').optional().isInt({ min: 0 }).withMessage('Cleanup time must be a non-negative integer'),
    body('service_details.brings_equipment').optional().isBoolean().withMessage('Brings equipment must be a boolean value'),
    body('service_details.remote_service').optional().isBoolean().withMessage('Remote service must be a boolean value'),
    body('service_details.experience_years').optional().isInt({ min: 0 }).withMessage('Experience years must be a non-negative integer')
  ]
};

/**
 * Booking validation rules
 */
const bookingValidationRules = {
  create: [
    body('listing_id').isInt().withMessage('Listing ID must be an integer'),
    body('start_datetime').isISO8601().withMessage('Start date must be a valid date'),
    body('end_datetime').isISO8601().withMessage('End date must be a valid date'),
    body('booking_type').isIn(['hourly', 'daily']).withMessage('Booking type must be either hourly or daily'),
    body('guests_count').optional().isInt({ min: 1 }).withMessage('Guests count must be at least 1'),
    body('notes').optional().trim()
  ],
  update: [
    body('status').optional().isIn(['pending', 'confirmed', 'cancelled', 'completed']).withMessage('Invalid status'),
    body('payment_status').optional().isIn(['paid', 'unpaid', 'refunded']).withMessage('Invalid payment status'),
    body('notes').optional().trim()
  ]
};

/**
 * Blocked dates validation rules
 */
const blockedDatesValidationRules = {
  create: [
    body('start_datetime').isISO8601().withMessage('Start date must be a valid date'),
    body('end_datetime').isISO8601().withMessage('End date must be a valid date'),
    body('reason').optional().trim()
  ],
  update: [
    body('start_datetime').optional().isISO8601().withMessage('Start date must be a valid date'),
    body('end_datetime').optional().isISO8601().withMessage('End date must be a valid date'),
    body('reason').optional().trim()
  ]
};

/**
 * Cancellation policy validation rules
 */
const cancellationPolicyValidationRules = {
  create: [
    body('name')
      .isIn(['flexible', 'moderate', 'strict', 'non_refundable'])
      .withMessage('Policy name must be one of: flexible, moderate, strict, non_refundable'),
    body('description').notEmpty().withMessage('Description is required'),
    body('refund_before_days')
      .isInt({ min: 0 })
      .withMessage('Refund before days must be a non-negative integer'),
    body('refund_before_percentage')
      .isInt({ min: 0, max: 100 })
      .withMessage('Refund before percentage must be between 0 and 100'),
    body('refund_after_percentage')
      .isInt({ min: 0, max: 100 })
      .withMessage('Refund after percentage must be between 0 and 100')
  ],
  update: [
    body('name')
      .optional()
      .isIn(['flexible', 'moderate', 'strict', 'non_refundable'])
      .withMessage('Policy name must be one of: flexible, moderate, strict, non_refundable'),
    body('description').optional().notEmpty().withMessage('Description cannot be empty'),
    body('refund_before_days')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Refund before days must be a non-negative integer'),
    body('refund_before_percentage')
      .optional()
      .isInt({ min: 0, max: 100 })
      .withMessage('Refund before percentage must be between 0 and 100'),
    body('refund_after_percentage')
      .optional()
      .isInt({ min: 0, max: 100 })
      .withMessage('Refund after percentage must be between 0 and 100')
  ],
  calculate: [
    body('cancellation_date')
      .optional()
      .isISO8601()
      .withMessage('Cancellation date must be a valid date')
  ]
};

// ID parameter validation
const idParamValidation = [
  param('id').isInt().withMessage('ID must be an integer')
];

module.exports = {
  validate,
  userValidationRules,
  listingValidationRules,
  bookingValidationRules,
  blockedDatesValidationRules,
  cancellationPolicyValidationRules,
  idParamValidation
}; 