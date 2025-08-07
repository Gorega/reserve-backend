const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { badRequest } = require('./errorHandler');

// Create upload directory if it doesn't exist
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
console.log(`Upload directory configured as: ${uploadDir}`);
console.log(`Absolute path: ${path.resolve(uploadDir)}`);

if (!fs.existsSync(uploadDir)) {
  console.log(`Creating upload directory: ${uploadDir}`);
  fs.mkdirSync(uploadDir, { recursive: true });
} else {
  console.log(`Upload directory already exists: ${uploadDir}`);
  
  // Check if directory is writable
  try {
    fs.accessSync(uploadDir, fs.constants.W_OK);
    console.log(`Upload directory is writable: ${uploadDir}`);
  } catch (err) {
    console.error(`Upload directory is not writable: ${uploadDir}`, err);
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
 * Get file URL from filename
 * @param {string} filename - Filename
 * @returns {string} - File URL
 */
const getFileUrl = (filename) => {
  if (!filename) return null;
  
  // Get API URL from environment or use default
  const apiUrl = process.env.API_URL || 'http://localhost:8000';
  
  // Make sure the URL doesn't have double slashes
  const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
  
  // Return full URL to the file
  const url = `${baseUrl}/uploads/${filename}`;
  console.log(`Generated URL for file ${filename}: ${url}`);
  return url;
};

/**
 * Delete a file
 * @param {string} filename - Filename to delete
 */
const deleteFile = (filename) => {
  if (!filename) return;
  
  const filePath = path.join(uploadDir, filename);
  console.log(`Attempting to delete file: ${filePath}`);
  
  // Check if file exists before attempting to delete
  if (fs.existsSync(filePath)) {
    console.log(`File exists, deleting: ${filePath}`);
    fs.unlinkSync(filePath);
    console.log(`File deleted: ${filePath}`);
  } else {
    console.log(`File does not exist, cannot delete: ${filePath}`);
  }
};

module.exports = {
  uploadSingle,
  uploadMultiple,
  getFileUrl,
  deleteFile
}; 