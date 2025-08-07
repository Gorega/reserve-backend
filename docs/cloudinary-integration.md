# Cloudinary Integration Guide

This document explains how to use the Cloudinary integration for file uploads in the Reserve Backend application.

## Setup

1. Create a Cloudinary account at [https://cloudinary.com/](https://cloudinary.com/) if you don't have one already.

2. Get your Cloudinary credentials from the Cloudinary dashboard:
   - Cloud Name
   - API Key
   - API Secret

3. Add these credentials to your `.env` file:
   ```
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   CLOUDINARY_FOLDER=reserve-app
   ```

## Usage

### Uploading Files

The file upload utility now supports uploading to Cloudinary. The process works as follows:

1. Files are temporarily stored on the local filesystem using Multer
2. Files are then uploaded to Cloudinary
3. The local temporary files are automatically deleted after upload

```javascript
const { uploadSingle, uploadToCloudinary } = require('../utils/fileUpload');

// In your route handler
router.post('/upload', uploadSingle('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    // Upload to Cloudinary
    const result = await uploadToCloudinary(req.file.path);
    
    // Store the Cloudinary public_id and URL in your database
    const imageData = {
      publicId: result.public_id,
      url: result.secure_url
    };
    
    res.json({ success: true, image: imageData });
  } catch (error) {
    res.status(500).json({ message: 'Upload failed', error: error.message });
  }
});
```

### Getting File URLs

To get a file URL from a Cloudinary public ID:

```javascript
const { getFileUrl } = require('../utils/fileUpload');

const url = getFileUrl('reserve-app/image123');
// Returns: https://res.cloudinary.com/your-cloud-name/image/upload/v1/reserve-app/image123
```

### Deleting Files

To delete a file from Cloudinary:

```javascript
const { deleteFile } = require('../utils/fileUpload');

// Delete using public_id
await deleteFile('reserve-app/image123');

// Or delete using the full URL
await deleteFile('https://res.cloudinary.com/your-cloud-name/image/upload/v1/reserve-app/image123');
```

## Cloudinary Transformations

Cloudinary supports various image transformations. You can apply them during upload:

```javascript
const result = await uploadToCloudinary(filePath, {
  transformation: [
    { width: 800, height: 600, crop: 'fill' },
    { quality: 'auto' }
  ]
});
```

Or generate URLs with transformations:

```javascript
const url = cloudinary.url('reserve-app/image123', {
  width: 400,
  height: 300,
  crop: 'fill',
  quality: 'auto'
});
```

For more information on Cloudinary transformations, see the [Cloudinary documentation](https://cloudinary.com/documentation/image_transformations).
