const jwt = require('jsonwebtoken');
const { unauthorized, notFound, serverError } = require('../utils/errorHandler');
const db = require('../config/database');

/**
 * Middleware to protect routes that require authentication
 * Verifies the JWT token from Authorization header, cookies, or WebSocket handshake
 */
const protect = async (req, res, next) => {
  try {
    // Determine if this is a WebSocket request
    const isWebSocket = !res;
    let token;
    
    if (isWebSocket) {
      // WebSocket authentication
      // First check handshake.auth object
      if (req.handshake && req.handshake.auth && req.handshake.auth.token) {
        token = req.handshake.auth.token;
      } else if (req.auth && req.auth.token) {
        // Fallback to older format
        token = req.auth.token;
      } else {
        // Then fall back to checking cookies
        const cookies = req.headers.cookie;
        if (cookies) {
          const tokenCookie = cookies.split(';').find(c => c.trim().startsWith('token='));
          if (tokenCookie) {
            token = tokenCookie.split('=')[1];
          }
        }
      }
      
      // Handle WebSocket authentication failure
      if (!token) {
        throw new Error('Not authorized to access this route');
      }
    } else {
      // HTTP request authentication
      // 1. First check cookies
      if (req.cookies && req.cookies.token) {
        token = req.cookies.token;
      } 
      // 2. Then check Authorization header
      else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
      }
      
      // Check if token exists
      if (!token) {
        return next(unauthorized('Not authorized to access this route'));
      }
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user still exists
    const user = await db.getById('users', decoded.id);
    if (!user) {
      if (isWebSocket) {
        throw new Error('User no longer exists');
      }
      return next(unauthorized('User no longer exists'));
    }

    // Set user in request object
    delete user.password_hash; // Remove sensitive data
    req.user = user;
    
    
    if (isWebSocket) {
      // For WebSocket, return the user object
      return user;
    } else {
      // For HTTP, continue to next middleware
      next();
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    // Re-check if this is a WebSocket request since isWebSocket might be out of scope
    const isWs = !res;
    if (isWs) {
      throw new Error('Not authorized to access this route');
    }
    return next(unauthorized('Not authorized to access this route'));
  }
};

/**
 * Middleware to restrict access to certain roles
 * Must be used after the protect middleware
 */
const restrictTo = (...roles) => {
  return (req, res, next) => {
    // Check if user is a provider when required
    if (roles.includes('provider') && !req.user.is_provider) {
      return next(unauthorized('You do not have permission to perform this action'));
    }
    next();
  };
};

/**
 * Middleware to check if user owns the resource or is admin
 * Used for routes that require resource ownership
 */
const checkOwnership = (resourceTable, resourceIdParam) => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[resourceIdParam];
      const resource = await db.getById(resourceTable, resourceId);
      
      if (!resource) {
        return next(notFound(`${resourceTable} not found`));
      }
      
      // Check if user owns the resource
      if (resource.user_id !== req.user.id) {
        return next(unauthorized('You do not have permission to perform this action'));
      }
      
      next();
    } catch (error) {
      console.error('Check ownership error:', error);
      return next(serverError());
    }
  };
};

module.exports = {
  protect,
  restrictTo,
  checkOwnership
}; 