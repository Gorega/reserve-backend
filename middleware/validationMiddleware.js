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
    body('profile_image').optional()
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
    body('profile_image').optional()
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
    body('unit_type').optional().isIn(['hour', 'day', 'appointment', 'night']).withMessage('Invalid unit type'),
    body('is_hourly').optional().isBoolean().withMessage('Is hourly must be a boolean value'),
    body('location').trim().notEmpty().withMessage('Location is required'),
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
    body('instant_booking').optional().isBoolean().withMessage('Instant booking must be a boolean value'),
    body('cancellation_policy')
      .optional()
      .custom(value => {
        if (!value) return true;
        const validPolicies = ['flexible', 'moderate', 'strict', 'non_refundable'];
        if (validPolicies.includes(value)) return true;
        throw new Error('Invalid cancellation policy');
      }),
    
    // Property details validation (for accommodations)
    body('property_details.max_guests').optional().isInt({ min: 1 }).withMessage('Maximum guests must be at least 1'),
    body('property_details.bedrooms').optional().isInt({ min: 0 }).withMessage('Bedrooms must be a non-negative integer'),
    body('property_details.beds').optional().isInt({ min: 1 }).withMessage('Beds must be at least 1'),
    body('property_details.bathrooms').optional().isFloat({ min: 0 }).withMessage('Bathrooms must be a non-negative number'),
    body('property_details.property_type')
      .optional()
      .custom(value => {
        if (!value) return true;
        return true;
      }),
    body('property_details.room_type')
      .optional()
      .custom(value => {
        if (value === null || value === undefined || value === '') return true;
        return true;
      }),
    body('property_details.min_nights').optional().isInt({ min: 1 }).withMessage('Minimum nights must be at least 1'),
    body('property_details.max_nights')
      .optional()
      .custom(value => {
        if (value === null || value === undefined) return true;
        const numValue = parseInt(value);
        if (isNaN(numValue) || numValue < 1) {
          throw new Error('Maximum nights must be at least 1');
        }
        return true;
      }),
    
    // Car details validation (for car rentals)
    body('car_details.brand')
      .optional()
      .custom(value => {
        if (value === null || value === undefined || value === '') return true;
        return true;
      }),
    body('car_details.model')
      .optional()
      .custom(value => {
        if (value === null || value === undefined || value === '') return true;
        return true;
      }),
    body('car_details.year')
      .optional()
      .custom(value => {
        if (value === null || value === undefined || value === '') return true;
        const numValue = parseInt(value);
        const currentYear = new Date().getFullYear();
        if (isNaN(numValue) || numValue < 1900 || numValue > currentYear + 1) {
          throw new Error('Invalid car year');
        }
        return true;
      }),
    body('car_details.transmission')
      .optional()
      .custom(value => {
        if (value === null || value === undefined || value === '') return true;
        if (['automatic', 'manual'].includes(value)) return true;
        throw new Error('Invalid transmission type');
      }),
    body('car_details.seats')
      .optional()
      .custom(value => {
        if (value === null || value === undefined || value === '') return true;
        const numValue = parseInt(value);
        if (isNaN(numValue) || numValue < 1) {
          throw new Error('Seats must be at least 1');
        }
        return true;
      }),
    body('car_details.fuel_type')
      .optional()
      .custom(value => {
        if (value === null || value === undefined || value === '') return true;
        return true;
      }),
    body('car_details.mileage')
      .optional()
      .custom(value => {
        if (value === null || value === undefined || value === '') return true;
        const numValue = parseInt(value);
        if (isNaN(numValue) || numValue < 0) {
          throw new Error('Mileage must be a non-negative integer');
        }
        return true;
      }),
    
    // Service details validation (for services)
    body('service_details.service_duration')
      .optional()
      .custom(value => {
        if (value === null || value === undefined || value === '') return true;
        const numValue = parseInt(value);
        if (isNaN(numValue) || numValue < 1) {
          throw new Error('Service duration must be at least 1 minute');
        }
        return true;
      }),
    body('service_details.preparation_time')
      .optional()
      .custom(value => {
        if (value === null || value === undefined || value === '') return true;
        const numValue = parseInt(value);
        if (isNaN(numValue) || numValue < 0) {
          throw new Error('Preparation time must be a non-negative integer');
        }
        return true;
      }),
    body('service_details.cleanup_time')
      .optional()
      .custom(value => {
        if (value === null || value === undefined || value === '') return true;
        const numValue = parseInt(value);
        if (isNaN(numValue) || numValue < 0) {
          throw new Error('Cleanup time must be a non-negative integer');
        }
        return true;
      }),
    body('service_details.brings_equipment')
      .optional()
      .custom(value => {
        if (value === null || value === undefined) return true;
        return true;
      }),
    body('service_details.remote_service')
      .optional()
      .custom(value => {
        if (value === null || value === undefined) return true;
        return true;
      }),
    body('service_details.experience_years')
      .optional()
      .custom(value => {
        if (value === null || value === undefined || value === '') return true;
        const numValue = parseInt(value);
        if (isNaN(numValue) || numValue < 0) {
          throw new Error('Experience years must be a non-negative integer');
        }
        return true;
      })
  ],
  update: [
    body('title').optional().trim().notEmpty().withMessage('Title cannot be empty'),
    body('description').optional().trim().notEmpty().withMessage('Description cannot be empty'),
    body('category_id').optional().isInt().withMessage('Category ID must be an integer'),
    body('price_per_hour').optional(),
    body('price_per_day').optional(),
    body('price_per_half_night').optional(),
    body('unit_type').optional().isIn(['hour', 'day', 'appointment', 'night']).withMessage('Invalid unit type'),
    body('is_hourly').optional().isBoolean().withMessage('Is hourly must be a boolean value'),
    body('location').optional().trim().notEmpty().withMessage('Location cannot be empty'),
    body('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
    body('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
    body('instant_booking').optional().isBoolean().withMessage('Instant booking must be a boolean value'),
    body('cancellation_policy')
      .optional()
      .custom(value => {
        if (!value) return true;
        const validPolicies = ['flexible', 'moderate', 'strict', 'non_refundable'];
        if (validPolicies.includes(value)) return true;
        throw new Error('Invalid cancellation policy');
      }),
    body('active').optional().isBoolean().withMessage('Active must be a boolean value'),
    
    // Property details validation (for accommodations)
    body('property_details.max_guests').optional().isInt({ min: 1 }).withMessage('Maximum guests must be at least 1'),
    body('property_details.bedrooms').optional().isInt({ min: 0 }).withMessage('Bedrooms must be a non-negative integer'),
    body('property_details.beds').optional().isInt({ min: 1 }).withMessage('Beds must be at least 1'),
    body('property_details.bathrooms').optional().isFloat({ min: 0 }).withMessage('Bathrooms must be a non-negative number'),
    body('property_details.property_type')
      .optional()
      .custom(value => {
        if (!value) return true;
        return true;
      }),
    body('property_details.room_type')
      .optional()
      .custom(value => {
        if (value === null || value === undefined || value === '') return true;
        return true;
      }),
    body('property_details.min_nights').optional().isInt({ min: 1 }).withMessage('Minimum nights must be at least 1'),
    body('property_details.max_nights')
      .optional()
      .custom(value => {
        if (value === null || value === undefined) return true;
        const numValue = parseInt(value);
        if (isNaN(numValue) || numValue < 1) {
          throw new Error('Maximum nights must be at least 1');
        }
        return true;
      }),
    
    // Car details validation (for car rentals)
    body('car_details.brand')
      .optional()
      .custom(value => {
        if (value === null || value === undefined || value === '') return true;
        return true;
      }),
    body('car_details.model')
      .optional()
      .custom(value => {
        if (value === null || value === undefined || value === '') return true;
        return true;
      }),
    body('car_details.year')
      .optional()
      .custom(value => {
        if (value === null || value === undefined || value === '') return true;
        const numValue = parseInt(value);
        const currentYear = new Date().getFullYear();
        if (isNaN(numValue) || numValue < 1900 || numValue > currentYear + 1) {
          throw new Error('Invalid car year');
        }
        return true;
      }),
    body('car_details.transmission')
      .optional()
      .custom(value => {
        if (value === null || value === undefined || value === '') return true;
        if (['automatic', 'manual'].includes(value)) return true;
        throw new Error('Invalid transmission type');
      }),
    body('car_details.seats')
      .optional()
      .custom(value => {
        if (value === null || value === undefined || value === '') return true;
        const numValue = parseInt(value);
        if (isNaN(numValue) || numValue < 1) {
          throw new Error('Seats must be at least 1');
        }
        return true;
      }),
    body('car_details.fuel_type')
      .optional()
      .custom(value => {
        if (value === null || value === undefined || value === '') return true;
        return true;
      }),
    body('car_details.mileage')
      .optional()
      .custom(value => {
        if (value === null || value === undefined || value === '') return true;
        const numValue = parseInt(value);
        if (isNaN(numValue) || numValue < 0) {
          throw new Error('Mileage must be a non-negative integer');
        }
        return true;
      }),
    
    // Service details validation (for services)
    body('service_details.service_duration')
      .optional()
      .custom(value => {
        if (value === null || value === undefined || value === '') return true;
        const numValue = parseInt(value);
        if (isNaN(numValue) || numValue < 1) {
          throw new Error('Service duration must be at least 1 minute');
        }
        return true;
      }),
    body('service_details.preparation_time')
      .optional()
      .custom(value => {
        if (value === null || value === undefined || value === '') return true;
        const numValue = parseInt(value);
        if (isNaN(numValue) || numValue < 0) {
          throw new Error('Preparation time must be a non-negative integer');
        }
        return true;
      }),
    body('service_details.cleanup_time')
      .optional()
      .custom(value => {
        if (value === null || value === undefined || value === '') return true;
        const numValue = parseInt(value);
        if (isNaN(numValue) || numValue < 0) {
          throw new Error('Cleanup time must be a non-negative integer');
        }
        return true;
      }),
    body('service_details.brings_equipment')
      .optional()
      .custom(value => {
        if (value === null || value === undefined) return true;
        return true;
      }),
    body('service_details.remote_service')
      .optional()
      .custom(value => {
        if (value === null || value === undefined) return true;
        return true;
      }),
    body('service_details.experience_years')
      .optional()
      .custom(value => {
        if (value === null || value === undefined || value === '') return true;
        const numValue = parseInt(value);
        if (isNaN(numValue) || numValue < 0) {
          throw new Error('Experience years must be a non-negative integer');
        }
        return true;
      })
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
    body('booking_type').isIn(['hourly', 'daily', 'appointment', 'night']).withMessage('Booking type must be either hourly or daily'),
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