/**
 * Custom error class for API errors
 * Extends the built-in Error class with additional properties
 */
class ApiError extends Error {
  constructor(statusCode, message, isOperational = true, stack = '') {
    // If message is an object, convert it to a string representation
    const messageStr = typeof message === 'object' ? JSON.stringify(message) : message;
    super(messageStr);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    
    // Store the original message object if it's an object
    if (typeof message === 'object') {
      this.originalMessage = message;
    }
    
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Creates a 400 Bad Request error
 */
const badRequest = (message) => {
  return new ApiError(400, message || 'Bad Request');
};

/**
 * Creates a 401 Unauthorized error
 */
const unauthorized = (message) => {
  return new ApiError(401, message || 'Unauthorized');
};

/**
 * Creates a 403 Forbidden error
 */
const forbidden = (message) => {
  return new ApiError(403, message || 'Forbidden');
};

/**
 * Creates a 404 Not Found error
 */
const notFound = (message) => {
  return new ApiError(404, message || 'Resource not found');
};

/**
 * Creates a 409 Conflict error
 */
const conflict = (message) => {
  return new ApiError(409, message || 'Conflict');
};

/**
 * Creates a 422 Unprocessable Entity error
 */
const validationError = (message) => {
  return new ApiError(422, message || 'Validation Error');
};

/**
 * Creates a 500 Internal Server Error
 */
const serverError = (message) => {
  return new ApiError(500, message || 'Internal Server Error', true);
};

/**
 * General error handler function
 * Converts any error to an ApiError for consistent error handling
 */
const errorHandler = (err) => {
  if (err instanceof ApiError) {
    return err;
  }
  
  // Handle MySQL errors
  if (err.code && err.code.startsWith('ER_')) {
    return serverError({
      message: 'Database error',
      originalError: err.message,
      code: err.code
    });
  }
  
  // Handle validation errors
  if (err.name === 'ValidationError') {
    return validationError(err);
  }
  
  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return unauthorized('Invalid token');
  }
  
  if (err.name === 'TokenExpiredError') {
    return unauthorized('Token expired');
  }
  
  // Default to server error
  return serverError(err.message);
};

module.exports = {
  ApiError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  validationError,
  serverError,
  errorHandler
}; 