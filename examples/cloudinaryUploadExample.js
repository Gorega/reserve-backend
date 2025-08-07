/**
 * Example of how to use the updated fileUpload utility with Cloudinary
 */
const express = require('express');
const router = express.Router();
const { uploadSingle, uploadToCloudinary, getFileUrl, deleteFile } = require('../utils/fileUpload');
const path = require('path');

// Example route for uploading a single image
router.post('/upload-image', uploadSingle('image'), async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    // Get the path to the uploaded file
    const filePath = path.join(process.cwd(), req.file.path);
    
    // Upload to Cloudinary with optional transformations
    const cloudinaryResult = await uploadToCloudinary(filePath, {
      // Optional transformations
      transformation: [
        { width: 1000, crop: 'limit' },
        { quality: 'auto' }
      ]
    });
    
    // Return the Cloudinary upload result
    res.json({
      success: true,
      file: {
        publicId: cloudinaryResult.public_id,
        url: cloudinaryResult.secure_url,
        format: cloudinaryResult.format,
        width: cloudinaryResult.width,
        height: cloudinaryResult.height
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Upload failed', error: error.message });
  }
});

// Example route for deleting an image
router.delete('/delete-image/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;
    
    // Delete from Cloudinary
    const result = await deleteFile(publicId);
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ message: 'Delete failed', error: error.message });
  }
});

module.exports = router;
