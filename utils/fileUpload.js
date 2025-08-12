const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const { badRequest } = require('./errorHandler');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Create temporary upload directory if it doesn't exist
const uploadDir = process.env.UPLOAD_DIR || 'uploads';

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
} else {
  
  // Check if directory is writable
  try {
    fs.accessSync(uploadDir, fs.constants.W_OK);
  } catch (err) {
    console.error(`Temporary upload directory is not writable: ${uploadDir}`, err);
  }
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate a unique filename with timestamp and original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const filename = file.fieldname + '-' + uniqueSuffix + ext;
    cb(null, filename);
  }
});

// File filter to only allow images
const fileFilter = (req, file, cb) => {
  // Accept images only
  if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
    return cb(badRequest('Only image files are allowed!'), false);
  }
  cb(null, true);
};

// Configure upload limits
const limits = {
  fileSize: process.env.MAX_FILE_SIZE || 5 * 1024 * 1024 // 5MB default
};

// Create multer instance
const upload = multer({
  storage,
  fileFilter,
  limits
});

/**
 * Upload a single file
 * @param {string} fieldName - Form field name for the file
 */
const uploadSingle = (fieldName) => {
  return upload.single(fieldName);
};

/**
 * Upload multiple files
 * @param {string} fieldName - Form field name for the files
 * @param {number} maxCount - Maximum number of files
 */
const uploadMultiple = (fieldName, maxCount = 5) => {
  return upload.array(fieldName, maxCount);
};

/**
 * Upload file to Cloudinary
 * @param {string} filePath - Path to the local file
 * @param {Object} options - Cloudinary upload options
 * @returns {Promise<Object>} - Cloudinary upload result
 */
const uploadToCloudinary = async (filePath, options = {}) => {
  
  // Check if file exists
  if (!require('fs').existsSync(filePath)) {
    throw new Error(`File does not exist: ${filePath}`);
  }
  
  // Check if Cloudinary is configured
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary configuration is missing. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.');
  }
  
  try {
    const folder = process.env.CLOUDINARY_FOLDER || 'reserve-app';
    
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      ...options
    });
    
    return result;
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    console.error('Error details:', {
      message: error.message,
      http_code: error.http_code,
      name: error.name
    });
    throw error;
  } finally {
    // Remove the local file after upload
    if (require('fs').existsSync(filePath)) {
      require('fs').unlinkSync(filePath);
    }
  }
};

/**
 * Get file URL from Cloudinary public_id or URL
 * @param {string} publicIdOrUrl - Cloudinary public_id or URL
 * @returns {string} - File URL
 */
const getFileUrl = (publicIdOrUrl) => {
  if (!publicIdOrUrl) return null;
  
  // If it's already a complete URL, return it
  if (publicIdOrUrl.startsWith('http')) {
    return publicIdOrUrl;
  }
  
  // Return Cloudinary URL
  return cloudinary.url(publicIdOrUrl, {
    secure: true
  });
};

/**
 * Delete a file from Cloudinary
 * @param {string} publicIdOrUrl - Cloudinary public_id or URL
 * @returns {Promise<Object>} - Deletion result
 */
const deleteFile = async (publicIdOrUrl) => {
  if (!publicIdOrUrl) return;
  
  try {
    // Extract public_id from URL if needed
    let publicId = publicIdOrUrl;
    
    if (publicIdOrUrl.includes('cloudinary.com')) {
      // Extract public_id from Cloudinary URL
      const urlParts = publicIdOrUrl.split('/');
      const filenamePart = urlParts[urlParts.length - 1];
      const filename = filenamePart.split('.')[0]; // Remove extension
      publicId = `${process.env.CLOUDINARY_FOLDER || 'reserve-app'}/${filename}`;
    }
    
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error(`Error deleting file from Cloudinary: ${publicIdOrUrl}`, error);
    throw error;
  }
};

module.exports = {
  uploadSingle,
  uploadMultiple,
  uploadToCloudinary,
  getFileUrl,
  deleteFile
}; 