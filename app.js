const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const cookieParser = require('cookie-parser');
const http = require('http');
const socketIo = require('socket.io');
const methodOverride = require('method-override');
const fs = require('fs');

// Load environment variables
dotenv.config();

// Make sure uploads directory exists with proper permissions
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
const absoluteUploadPath = path.join(__dirname, uploadDir);

if (!fs.existsSync(absoluteUploadPath)) {
  console.log(`Creating uploads directory: ${absoluteUploadPath}`);
  try {
    fs.mkdirSync(absoluteUploadPath, { recursive: true, mode: 0o777 });
    console.log(`Created uploads directory: ${absoluteUploadPath}`);
  } catch (err) {
    console.error(`Failed to create uploads directory: ${absoluteUploadPath}`, err);
  }
} else {
  console.log(`Uploads directory already exists: ${absoluteUploadPath}`);
  // Try to set permissions
  try {
    fs.chmodSync(absoluteUploadPath, 0o777);
    console.log(`Set permissions on uploads directory: ${absoluteUploadPath}`);
  } catch (err) {
    console.error(`Failed to set permissions on uploads directory: ${absoluteUploadPath}`, err);
  }
}

// Import routes
const userRoutes = require('./routes/userRoutes');
const listingRoutes = require('./routes/listingRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const paymentLocationRoutes = require('./routes/paymentLocationRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const messageRoutes = require('./routes/messageRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const payoutRoutes = require('./routes/payoutRoutes');
const hostRoutes = require('./routes/hostRoutes');
const reportRoutes = require('./routes/reportRoutes');
const listingFeaturesRoutes = require('./routes/listingFeaturesRoutes');
const blockedDatesRoutes = require('./routes/blockedDatesRoutes');
const cancellationPolicyRoutes = require('./routes/cancellationPolicyRoutes');
const pricingOptionRoutes = require('./routes/pricingOptionRoutes');
const specialPricingRoutes = require('./routes/specialPricingRoutes');

// Create Express app
const app = express();
const server = http.createServer(app);

const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:19000', // Expo development server
    'http://localhost:19001',
    'http://localhost:19002',
    'http://localhost:19006',
    'exp://*', // Expo Go app
    process.env.FRONTEND_URL || '*'
  ],
  credentials: true
};

const io = socketIo(server, {
  cors: corsOptions,
  allowEIO3: true,
  path: '/socket.io',
  transports: ['websocket', 'polling']
});

// Initialize socket.io
require('./utils/socket')(io);

// Set up middleware
app.use(helmet({
  crossOriginResourcePolicy: false // Allow images to be served cross-origin
})); // Security headers
app.use(cors({
  origin: corsOptions.origin,
  credentials: true // Allow cookies to be sent with requests
})); // Enable CORS
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(cookieParser()); // Parse cookies
app.use(morgan('dev')); // HTTP request logger

// Method override middleware to handle PUT/DELETE in forms
app.use(methodOverride('_method'));
// Also support _method in request body
app.use((req, res, next) => {
  if (req.body && req.body._method) {
    req.method = req.body._method.toUpperCase();
    delete req.body._method;
  }
  next();
});

// Serve uploaded files
app.use('/uploads', (req, res, next) => {
  console.log(`Accessing uploaded file: ${req.url}`);
  next();
}, express.static(path.join(__dirname, uploadDir)));

// Debug middleware for file uploads
app.use((req, res, next) => {
  if (req.files) {
    console.log('Files uploaded:', req.files.map(f => ({
      fieldname: f.fieldname,
      originalname: f.originalname,
      mimetype: f.mimetype,
      filename: f.filename,
      size: f.size
    })));
  }
  next();
});

// Make io accessible to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// API routes
app.use('/api/users', userRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/listings/:listingId/pricing-options', pricingOptionRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/payment-locations', paymentLocationRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/wishlists', wishlistRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api/hosts', hostRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/listing-features', listingFeaturesRoutes);
app.use('/api/blocked-dates', blockedDatesRoutes);
app.use('/api/cancellation-policies', cancellationPolicyRoutes);
app.use('/api/special-pricing', specialPricingRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Reservation API' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  const statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  
  // Handle validation errors with originalMessage
  if (err.originalMessage && err.originalMessage.errors) {
    return res.status(statusCode).json({
      status: 'error',
      statusCode,
      message: 'Validation failed',
      errors: err.originalMessage.errors
    });
  }
  
  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Uploads directory: ${path.join(__dirname, uploadDir)}`);
});

module.exports = { app, server, io }; // For testing purposes