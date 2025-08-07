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
console.log(`Temporary upload directory configured as: ${uploadDir}`);
console.log(`Absolute path: ${path.resolve(uploadDir)}`);

if (!fs.existsSync(uploadDir)) {
  console.log(`Creating temporary upload directory: ${uploadDir}`);
  fs.mkdirSync(uploadDir, { recursive: true });
} else {
  console.log(`Temporary upload directory already exists: ${uploadDir}`);
  
  // Check if directory is writable
  try {
    fs.accessSync(uploadDir, fs.constants.W_OK);
    console.log(`Temporary upload directory is writable: ${uploadDir}`);
  } catch (err) {
    console.error(`Temporary upload directory is not writable: ${uploadDir}`, err);
  }
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log(`Setting destination for file: ${file.originalname}`);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate a unique filename with timestamp and original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const filename = file.fieldname + '-' + uniqueSuffix + ext;
    console.log(`Generated filename: ${filename} for original: ${file.originalname}`);
    cb(null, filename);
  }
});

// File filter to only allow images
const fileFilter = (req, file, cb) => {
  console.log(`Filtering file: ${file.originalname}, mimetype: ${file.mimetype}`);
  // Accept images only
  if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
    console.log(`Rejected file: ${file.originalname} - not an image`);
    return cb(badRequest('Only image files are allowed!'), false);
  }
  console.log(`Accepted file: ${file.originalname}`);
  cb(null, true);
};

// Configure upload limits
const limits = {
  fileSize: process.env.MAX_FILE_SIZE || 5 * 1024 * 1024 // 5MB default
};
console.log(`File size limit: ${limits.fileSize} bytes`);

// Create multer instance
const upload = multer({
  storage,
  fileFilter,
  limits
});
console.log('Multer upload middleware configured');

/**
 * Upload a single file
 * @param {string} fieldName - Form field name for the file
 */
const uploadSingle = (fieldName) => {
  console.log(`Creating single file upload middleware for field: ${fieldName}`);
  return upload.single(fieldName);
};

/**
 * Upload multiple files
 * @param {string} fieldName - Form field name for the files
 * @param {number} maxCount - Maximum number of files
 */
const uploadMultiple = (fieldName, maxCount = 5) => {
  console.log(`Creating multiple file upload middleware for field: ${fieldName}, max: ${maxCount}`);
  return upload.array(fieldName, maxCount);
};

/**
 * Upload file to Cloudinary
 * @param {string} filePath - Path to the local file
 * @param {Object} options - Cloudinary upload options
 * @returns {Promise<Object>} - Cloudinary upload result
 */
const uploadToCloudinary = async (filePath, options = {}) => {
  console.log(`Uploading to Cloudinary: ${filePath}`);
  try {
    const folder = process.env.CLOUDINARY_FOLDER || 'reserve-app';
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      ...options
    });
    console.log(`File uploaded to Cloudinary: ${result.public_id}`);
    return result;
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw error;
  } finally {
    // Remove the local file after upload
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Temporary file deleted: ${filePath}`);
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
    
    console.log(`Attempting to delete file from Cloudinary: ${publicId}`);
    const result = await cloudinary.uploader.destroy(publicId);
    console.log(`File deleted from Cloudinary: ${publicId}`, result);
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