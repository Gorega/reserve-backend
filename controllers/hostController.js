const db = require('../config/database');
const { errorHandler, notFound, badRequest } = require('../utils/errorHandler');
const { toUTCDateString, createUTCDateTime, extractTimeFromDateTime, extractDateFromDateTime, doDateRangesOverlap, startOfDay, endOfDay } = require('../utils/dateUtils');
const { getFileUrl, deleteFile, uploadToCloudinary } = require('../utils/fileUpload');

/**
 * Host Controller
 * Handles HTTP requests for host operations
 */
const hostController = {
  /**
   * Get host profile
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getProfile(req, res, next) {
    try {
      const userId = req.params.userId || req.user.id;
      
      // Get host profile
      const [hostProfile] = await db.query(`
        SELECT hp.*, u.name, u.email, u.phone, u.profile_image,
          (SELECT COUNT(*) FROM listings WHERE user_id = hp.user_id AND active = 1) as listing_count,
          (SELECT AVG(r.rating) FROM reviews r 
           JOIN listings l ON r.listing_id = l.id 
           WHERE l.user_id = hp.user_id) as avg_rating,
          (SELECT COUNT(*) FROM reviews r 
           JOIN listings l ON r.listing_id = l.id 
           WHERE l.user_id = hp.user_id) as review_count
        FROM host_profiles hp
        JOIN users u ON hp.user_id = u.id
        WHERE hp.user_id = ?
      `, [userId]);
      
      if (!hostProfile) {
        // If no host profile exists, get basic user info
        const [user] = await db.query(`
          SELECT id, name, email, phone, profile_image, created_at
          FROM users 
          WHERE id = ?
        `, [userId]);
        
        if (!user) {
          return res.status(404).json({
            status: 'error',
            message: 'User not found'
          });
        }
        
        return res.status(200).json({
          status: 'success',
          data: {
            ...user,
            listing_count: 0,
            avg_rating: 0,
            review_count: 0,
            is_host_profile_created: false
          }
        });
      }
      
      // Get host listings
      const listings = await db.query(`
        SELECT l.id, l.title, l.price_per_hour, l.price_per_day, l.location, l.rating, l.review_count,
          (SELECT image_url FROM listing_photos WHERE listing_id = l.id AND is_cover = 1 LIMIT 1) as cover_photo
        FROM listings l
        WHERE l.user_id = ? AND l.active = 1
        ORDER BY l.created_at DESC
        LIMIT 5
      `, [userId]);
      
      // Get host reviews
      const reviews = await db.query(`
        SELECT r.*, l.id as listing_id, l.title as listing_title,
          u.name as reviewer_name, u.profile_image as reviewer_image
        FROM reviews r
        JOIN listings l ON r.listing_id = l.id
        JOIN users u ON r.reviewer_id = u.id
        WHERE l.user_id = ?
        ORDER BY r.created_at DESC
        LIMIT 5
      `, [userId]);
      
      res.status(200).json({
        status: 'success',
        data: {
          ...hostProfile,
          listings,
          reviews,
          is_host_profile_created: true
        }
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Create or update host profile
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updateProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const profileData = req.body;
      
      // Check if host profile exists
      const [existingProfile] = await db.query(
        'SELECT * FROM host_profiles WHERE user_id = ?',
        [userId]
      );
      
      if (existingProfile) {
        // Update existing profile
        await db.query(
          'UPDATE host_profiles SET ? WHERE user_id = ?',
          [profileData, userId]
        );
      } else {
        // Create new profile
        await db.query(
          'INSERT INTO host_profiles SET ?',
          [{ ...profileData, user_id: userId, joined_date: new Date() }]
        );
      }
      
      // Get updated profile
      const [updatedProfile] = await db.query(`
        SELECT hp.*, u.name, u.email, u.phone, u.profile_image
        FROM host_profiles hp
        JOIN users u ON hp.user_id = u.id
        WHERE hp.user_id = ?
      `, [userId]);
      
      res.status(200).json({
        status: 'success',
        data: updatedProfile
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Get host qualifications
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getQualifications(req, res, next) {
    try {
      const userId = req.params.userId || req.user.id;
      
      const qualifications = await db.query(
        'SELECT * FROM provider_qualifications WHERE user_id = ? ORDER BY issue_date DESC',
        [userId]
      );
      
      res.status(200).json({
        status: 'success',
        results: qualifications.length,
        data: qualifications
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Add qualification
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async addQualification(req, res, next) {
    try {
      const userId = req.user.id;
      const qualificationData = {
        ...req.body,
        user_id: userId
      };
      
      const result = await db.insert('provider_qualifications', qualificationData);
      
      const [qualification] = await db.query(
        'SELECT * FROM provider_qualifications WHERE id = ?',
        [result.insertId]
      );
      
      res.status(201).json({
        status: 'success',
        data: qualification
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Update qualification
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updateQualification(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      // Check if qualification exists and belongs to user
      const [qualification] = await db.query(
        'SELECT * FROM provider_qualifications WHERE id = ?',
        [id]
      );
      
      if (!qualification) {
        return res.status(404).json({
          status: 'error',
          message: 'Qualification not found'
        });
      }
      
      if (qualification.user_id !== userId) {
        return res.status(403).json({
          status: 'error',
          message: 'You are not authorized to update this qualification'
        });
      }
      
      // Update qualification
      await db.update('provider_qualifications', id, req.body);
      
      // Get updated qualification
      const [updatedQualification] = await db.query(
        'SELECT * FROM provider_qualifications WHERE id = ?',
        [id]
      );
      
      res.status(200).json({
        status: 'success',
        data: updatedQualification
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Delete qualification
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async deleteQualification(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      // Check if qualification exists and belongs to user
      const [qualification] = await db.query(
        'SELECT * FROM provider_qualifications WHERE id = ?',
        [id]
      );
      
      if (!qualification) {
        return res.status(404).json({
          status: 'error',
          message: 'Qualification not found'
        });
      }
      
      if (qualification.user_id !== userId) {
        return res.status(403).json({
          status: 'error',
          message: 'You are not authorized to delete this qualification'
        });
      }
      
      // Delete qualification
      await db.remove('provider_qualifications', id);
      
      res.status(204).end();
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Get portfolio items
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getPortfolio(req, res, next) {
    try {
      const userId = req.params.userId || req.user.id;
      
      const portfolio = await db.query(
        'SELECT * FROM provider_portfolio WHERE user_id = ? ORDER BY sort_order ASC',
        [userId]
      );
      
      res.status(200).json({
        status: 'success',
        results: portfolio.length,
        data: portfolio
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Add portfolio item
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async addPortfolioItem(req, res, next) {
    try {
      const userId = req.user.id;
      
      // Handle file upload if present
      let imageUrl = null;
      if (req.file) {
        try {
          // Upload to Cloudinary
          const cloudinaryResult = await uploadToCloudinary(req.file.path);
          imageUrl = cloudinaryResult.secure_url;
        } catch (uploadError) {
          console.error('Error uploading portfolio image:', uploadError);
          // Delete the local file if upload failed
          if (req.file.path && require('fs').existsSync(req.file.path)) {
            require('fs').unlinkSync(req.file.path);
          }
          return next(badRequest('Failed to upload portfolio image'));
        }
      } else if (!req.body.image_url) {
        return res.status(400).json({
          status: 'error',
          message: 'Image is required'
        });
      } else {
        imageUrl = req.body.image_url;
      }
      
      // Get max sort order
      const [maxSortResult] = await db.query(
        'SELECT MAX(sort_order) as max_sort FROM provider_portfolio WHERE user_id = ?',
        [userId]
      );
      
      const nextSortOrder = (maxSortResult.max_sort || 0) + 1;
      
      const portfolioData = {
        user_id: userId,
        title: req.body.title,
        description: req.body.description,
        image_url: imageUrl,
        sort_order: nextSortOrder
      };
      
      const result = await db.insert('provider_portfolio', portfolioData);
      
      const [portfolioItem] = await db.query(
        'SELECT * FROM provider_portfolio WHERE id = ?',
        [result.insertId]
      );
      
      res.status(201).json({
        status: 'success',
        data: portfolioItem
      });
    } catch (error) {
      // Delete uploaded file if there was an error
      if (req.file && req.file.path && require('fs').existsSync(req.file.path)) {
        require('fs').unlinkSync(req.file.path);
      }
      next(errorHandler(error));
    }
  },
  
  /**
   * Update portfolio item
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updatePortfolioItem(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      // Check if portfolio item exists and belongs to user
      const [portfolioItem] = await db.query(
        'SELECT * FROM provider_portfolio WHERE id = ?',
        [id]
      );
      
      if (!portfolioItem) {
        return res.status(404).json({
          status: 'error',
          message: 'Portfolio item not found'
        });
      }
      
      if (portfolioItem.user_id !== userId) {
        return res.status(403).json({
          status: 'error',
          message: 'You are not authorized to update this portfolio item'
        });
      }
      
      const updateData = { ...req.body };
      
      // Handle file upload if present
      if (req.file) {
        try {
          // Upload to Cloudinary
          const cloudinaryResult = await uploadToCloudinary(req.file.path);
          updateData.image_url = cloudinaryResult.secure_url;
          
          // Delete old image from Cloudinary
          if (portfolioItem.image_url && portfolioItem.image_url.includes('cloudinary.com')) {
            // Extract public_id from Cloudinary URL and delete
            const urlParts = portfolioItem.image_url.split('/');
            const filenamePart = urlParts[urlParts.length - 1];
            const filename = filenamePart.split('.')[0]; // Remove extension
            const publicId = `${process.env.CLOUDINARY_FOLDER || 'reserve-app'}/${filename}`;
            await deleteFile(publicId);
          }
        } catch (uploadError) {
          console.error('Error uploading portfolio image:', uploadError);
          // Delete the local file if upload failed
          if (req.file.path && require('fs').existsSync(req.file.path)) {
            require('fs').unlinkSync(req.file.path);
          }
          return next(badRequest('Failed to upload portfolio image'));
        }
      }
      
      // Update portfolio item
      await db.update('provider_portfolio', id, updateData);
      
      // Get updated portfolio item
      const [updatedItem] = await db.query(
        'SELECT * FROM provider_portfolio WHERE id = ?',
        [id]
      );
      
      res.status(200).json({
        status: 'success',
        data: updatedItem
      });
    } catch (error) {
      // Delete uploaded file if there was an error
      if (req.file && req.file.path && require('fs').existsSync(req.file.path)) {
        require('fs').unlinkSync(req.file.path);
      }
      next(errorHandler(error));
    }
  },
  
  /**
   * Delete portfolio item
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async deletePortfolioItem(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      // Check if portfolio item exists and belongs to user
      const [portfolioItem] = await db.query(
        'SELECT * FROM provider_portfolio WHERE id = ?',
        [id]
      );
      
      if (!portfolioItem) {
        return res.status(404).json({
          status: 'error',
          message: 'Portfolio item not found'
        });
      }
      
      if (portfolioItem.user_id !== userId) {
        return res.status(403).json({
          status: 'error',
          message: 'You are not authorized to delete this portfolio item'
        });
      }
      
      // Delete portfolio item
      await db.remove('provider_portfolio', id);
      
      // Delete image file
      if (portfolioItem.image_url) {
        const filename = portfolioItem.image_url.split('/').pop();
        deleteFile(filename);
      }
      
      res.status(204).end();
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Update portfolio item order
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updatePortfolioOrder(req, res, next) {
    try {
      const userId = req.user.id;
      const { items } = req.body;
      
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid items array'
        });
      }
      
      // Start a transaction
      const connection = await db.getPool().getConnection();
      await connection.beginTransaction();
      
      try {
        // Update each item's sort order
        for (let i = 0; i < items.length; i++) {
          const { id, sort_order } = items[i];
          
          // Check if item belongs to user
          const [item] = await connection.query(
            'SELECT * FROM provider_portfolio WHERE id = ? AND user_id = ?',
            [id, userId]
          );
          
          if (!item) {
            throw badRequest(`Portfolio item with ID ${id} not found or doesn't belong to you`);
          }
          
          // Update sort order
          await connection.query(
            'UPDATE provider_portfolio SET sort_order = ? WHERE id = ?',
            [sort_order || i, id]
          );
        }
        
        await connection.commit();
        
        // Get updated portfolio
        const portfolio = await db.query(
          'SELECT * FROM provider_portfolio WHERE user_id = ? ORDER BY sort_order ASC',
          [userId]
        );
        
        res.status(200).json({
          status: 'success',
          data: portfolio
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      next(errorHandler(error));
    }
  },

  /**
   * Get today's reservations for host
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getTodayReservations(req, res, next) {
    try {
      const userId = req.user.id;
      const today = new Date().toISOString().split('T')[0];
      
      console.log(`Getting today's reservations for host ID: ${userId}, date: ${today}`);
      
      const todayReservations = await db.query(`
        SELECT b.id, b.id as booking_id, b.start_datetime as check_in_date, b.end_datetime as check_out_date, b.status, 
               b.guests_count as guests, b.total_price, b.created_at,
               l.id as listing_id, l.title, l.location, 
               (SELECT image_url FROM listing_photos WHERE listing_id = l.id AND is_cover = 1 LIMIT 1) as primary_image,
               u.id as guest_id, u.name as guest_name, u.profile_image as guest_profile_image
        FROM bookings b
        JOIN listings l ON b.listing_id = l.id
        JOIN users u ON b.user_id = u.id
        WHERE l.user_id = ? 
        AND (
          (DATE(b.start_datetime) <= ? AND DATE(b.end_datetime) >= ?) OR
          (DATE(b.start_datetime) = ?)
        )
        AND b.status IN ('pending', 'confirmed', 'completed')
        ORDER BY b.start_datetime ASC
      `, [userId, today, today, today]);
      
      console.log(`Found ${todayReservations.length} reservations for today`);
      
      // Format the data for the frontend
      const formattedReservations = todayReservations.map(booking => ({
        id: booking.id,
        booking_id: booking.booking_id,
        check_in_date: booking.check_in_date,
        check_out_date: booking.check_out_date,
        status: booking.status,
        guests: booking.guests,
        total_price: booking.total_price,
        created_at: booking.created_at,
        listing: {
          id: booking.listing_id,
          title: booking.title,
          location: booking.location,
          primary_image: booking.primary_image
        },
        guest: {
          id: booking.guest_id,
          name: booking.guest_name,
          profile_image: booking.guest_profile_image
        }
      }));
      
      res.status(200).json({
        status: 'success',
        results: formattedReservations.length,
        data: formattedReservations
      });
    } catch (error) {
      console.error('Error getting today reservations:', error);
      next(errorHandler(error));
    }
  },
  
  /**
   * Get upcoming reservations for host
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getUpcomingReservations(req, res, next) {
    try {
      const userId = req.user.id;
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysLater = new Date();
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
      const thirtyDaysLaterStr = thirtyDaysLater.toISOString().split('T')[0];
      
      console.log(`Getting upcoming reservations for host ID: ${userId}, from ${today} to ${thirtyDaysLaterStr}`);
      
      const upcomingReservations = await db.query(`
        SELECT b.id, b.id as booking_id, b.start_datetime as check_in_date, b.end_datetime as check_out_date, b.status, 
               b.guests_count as guests, b.total_price, b.created_at,
               l.id as listing_id, l.title, l.location, 
               (SELECT image_url FROM listing_photos WHERE listing_id = l.id AND is_cover = 1 LIMIT 1) as primary_image,
               u.id as guest_id, u.name as guest_name, u.profile_image as guest_profile_image
        FROM bookings b
        JOIN listings l ON b.listing_id = l.id
        JOIN users u ON b.user_id = u.id
        WHERE l.user_id = ? 
        AND DATE(b.start_datetime) > ? 
        AND DATE(b.start_datetime) <= ?
        AND b.status IN ('pending', 'confirmed')
        ORDER BY b.start_datetime ASC
      `, [userId, today, thirtyDaysLaterStr]);
      
      console.log(`Found ${upcomingReservations.length} upcoming reservations`);
      
      // Format the data for the frontend
      const formattedReservations = upcomingReservations.map(booking => ({
        id: booking.id,
        booking_id: booking.booking_id,
        check_in_date: booking.check_in_date,
        check_out_date: booking.check_out_date,
        status: booking.status,
        guests: booking.guests,
        total_price: booking.total_price,
        created_at: booking.created_at,
        listing: {
          id: booking.listing_id,
          title: booking.title,
          location: booking.location,
          primary_image: booking.primary_image
        },
        guest: {
          id: booking.guest_id,
          name: booking.guest_name,
          profile_image: booking.guest_profile_image
        }
      }));
      
      res.status(200).json({
        status: 'success',
        results: formattedReservations.length,
        data: formattedReservations
      });
    } catch (error) {
      console.error('Error getting upcoming reservations:', error);
      next(errorHandler(error));
    }
  },

  /**
   * Debug endpoint to check for bookings directly
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async debugBookings(req, res, next) {
    try {
      const userId = req.user.id;
      
      // Get all listings for this host
      const listings = await db.query(`
        SELECT id, title FROM listings WHERE user_id = ?
      `, [userId]);
      
      if (listings.length === 0) {
        return res.status(200).json({
          status: 'success',
          message: 'No listings found for this host',
          data: { listings: [], bookings: [] }
        });
      }
      
      const listingIds = listings.map(listing => listing.id);
      
      // Get all bookings for these listings
      const bookings = await db.query(`
        SELECT b.*, l.title as listing_title, u.name as guest_name
        FROM bookings b
        JOIN listings l ON b.listing_id = l.id
        JOIN users u ON b.user_id = u.id
        WHERE l.user_id = ?
        ORDER BY b.created_at DESC
        LIMIT 50
      `, [userId]);
      
      res.status(200).json({
        status: 'success',
        data: {
          listings,
          bookings,
          user_id: userId
        }
      });
    } catch (error) {
      console.error('Error in debug bookings:', error);
      next(errorHandler(error));
    }
  },

  /**
   * Get all listings for the current host
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getHostListings(req, res, next) {
    try {
      console.log('getHostListings called');
      console.log('req.user:', req.user);
      
      if (!req.user) {
        console.error('req.user is undefined in getHostListings');
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }
      
      const userId = req.user.id;
      console.log(`Getting host listings for user ID: ${userId}`);
      
      const listings = await db.query(`
        SELECT l.id, l.title, l.price_per_hour, l.price_per_day, l.location, l.rating, l.review_count,
          (SELECT image_url FROM listing_photos WHERE listing_id = l.id AND is_cover = 1 LIMIT 1) as primary_image
        FROM listings l
        WHERE l.user_id = ?
        ORDER BY l.created_at DESC
      `, [userId]);
      
      console.log(`Found ${listings.length} listings for user ID ${userId}`);
      
      res.status(200).json({
        status: 'success',
        results: listings.length,
        data: listings
      });
    } catch (error) {
      console.error('Error getting host listings:', error);
      next(errorHandler(error));
    }
  },

  /**
   * Get all reservations for a specific listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getListingReservations(req, res, next) {
    try {
      const userId = req.user.id;
      const { listingId } = req.params;
      
      // Check if listing exists and belongs to user
      const [listing] = await db.query(
        'SELECT * FROM listings WHERE id = ? AND user_id = ?',
        [listingId, userId]
      );
      
      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found or not owned by you'
        });
      }
      
      // Get reservations
      const reservations = await db.query(`
        SELECT b.id, b.start_datetime as check_in_date, b.end_datetime as check_out_date, 
               b.status, b.guests_count as guests, b.total_price, b.created_at,
               u.id as guest_id, u.name as guest_name, u.profile_image as guest_profile_image
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        WHERE b.listing_id = ? 
        AND b.status IN ('pending', 'confirmed', 'completed')
        ORDER BY b.start_datetime ASC
      `, [listingId]);
      
      // Format data for frontend
      const formattedReservations = reservations.map(booking => ({
        id: booking.id,
        type: 'reservation',
        startDate: booking.check_in_date,
        endDate: booking.check_out_date,
        status: booking.status,
        guests: booking.guests,
        totalPrice: booking.total_price,
        guest: {
          id: booking.guest_id,
          name: booking.guest_name,
          profile_image: booking.guest_profile_image
        }
      }));
      
      res.status(200).json({
        status: 'success',
        results: formattedReservations.length,
        data: formattedReservations
      });
    } catch (error) {
      console.error('Error getting listing reservations:', error);
      next(errorHandler(error));
    }
  },

  /**
   * Get all blocked dates for a specific listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getListingBlockedDates(req, res, next) {
    try {
      const userId = req.user.id;
      const { listingId } = req.params;
      
      // Check if listing exists and belongs to user
      const [listing] = await db.query(
        'SELECT * FROM listings WHERE id = ? AND user_id = ?',
        [listingId, userId]
      );
      
      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found or not owned by you'
        });
      }
      
      // Get blocked dates
      const blockedDates = await db.query(
        'SELECT * FROM blocked_dates WHERE listing_id = ? ORDER BY start_datetime ASC',
        [listingId]
      );
      
      // Format data for frontend - consistent with other date handling
      const formattedBlockedDates = blockedDates.map(blockedDate => {
        try {
          // Extract date and time parts from start_datetime and end_datetime
          let startDateTime, endDateTime;
          
          if (blockedDate.start_datetime) {
            if (typeof blockedDate.start_datetime === 'string' && blockedDate.start_datetime.includes('T')) {
              // Remove timezone info if present and keep just YYYY-MM-DDTHH:MM:SS format
              startDateTime = blockedDate.start_datetime.split('.')[0].replace('Z', '');
            } else if (blockedDate.start_datetime instanceof Date) {
              // For Date objects, format without timezone
              const year = blockedDate.start_datetime.getFullYear();
              const month = String(blockedDate.start_datetime.getMonth() + 1).padStart(2, '0');
              const day = String(blockedDate.start_datetime.getDate()).padStart(2, '0');
              const hours = String(blockedDate.start_datetime.getHours()).padStart(2, '0');
              const minutes = String(blockedDate.start_datetime.getMinutes()).padStart(2, '0');
              const seconds = String(blockedDate.start_datetime.getSeconds()).padStart(2, '0');
              startDateTime = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
            } else {
              startDateTime = blockedDate.start_datetime;
            }
          }
          
          if (blockedDate.end_datetime) {
            if (typeof blockedDate.end_datetime === 'string' && blockedDate.end_datetime.includes('T')) {
              // Remove timezone info if present and keep just YYYY-MM-DDTHH:MM:SS format
              endDateTime = blockedDate.end_datetime.split('.')[0].replace('Z', '');
            } else if (blockedDate.end_datetime instanceof Date) {
              // For Date objects, format without timezone
              const year = blockedDate.end_datetime.getFullYear();
              const month = String(blockedDate.end_datetime.getMonth() + 1).padStart(2, '0');
              const day = String(blockedDate.end_datetime.getDate()).padStart(2, '0');
              const hours = String(blockedDate.end_datetime.getHours()).padStart(2, '0');
              const minutes = String(blockedDate.end_datetime.getMinutes()).padStart(2, '0');
              const seconds = String(blockedDate.end_datetime.getSeconds()).padStart(2, '0');
              endDateTime = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
            } else {
              endDateTime = blockedDate.end_datetime;
            }
          }
          
          return {
            id: blockedDate.id,
            type: 'blocked',
            startDate: startDateTime,
            endDate: endDateTime,
            reason: blockedDate.reason || ''
          };
        } catch (err) {
          console.error('Error formatting blocked date:', err, 'for record:', blockedDate);
          return {
            id: blockedDate.id,
            type: 'blocked',
            startDate: null,
            endDate: null,
            reason: blockedDate.reason || 'Error parsing date/time'
          };
        }
      });
      
      res.status(200).json({
        status: 'success',
        results: formattedBlockedDates.length,
        data: formattedBlockedDates
      });
    } catch (error) {
      console.error('Error getting blocked dates:', error);
      next(errorHandler(error));
    }
  },

  /**
   * Block dates for a specific listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async addListingBlockedDates(req, res, next) {
    try {
      console.log('\n🔒 BACKEND BLOCKING DEBUG - Request received');
      console.log('User ID:', req.user.id);
      console.log('Listing ID:', req.params.listingId);
      console.log('Request body:', JSON.stringify(req.body, null, 2));
      
      const userId = req.user.id;
      const { listingId } = req.params;
      const { start_date, end_date, start_datetime, end_datetime, reason, is_overnight, primary_date } = req.body;
      
      console.log('Extracted fields:');
      console.log('- start_date:', start_date);
      console.log('- end_date:', end_date);
      console.log('- start_datetime:', start_datetime);
      console.log('- end_datetime:', end_datetime);
      console.log('- reason:', reason);
      console.log('- is_overnight:', is_overnight);
      console.log('- primary_date:', primary_date);
      
      // Check if listing exists and belongs to user
      const [listing] = await db.query(
        'SELECT * FROM listings WHERE id = ? AND user_id = ?',
        [listingId, userId]
      );
      
      console.log('Listing found:', !!listing);
      
      if (!listing) {
        console.log('❌ Listing not found or not owned by user');
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found or not owned by you'
        });
      }

      // Get availability mode for this listing
      const [listingSettings] = await db.query(
        'SELECT availability_mode FROM listing_settings WHERE listing_id = ?',
        [listingId]
      );
      
      const availabilityMode = listingSettings?.availability_mode || 'available-by-default';
      console.log('Availability mode:', availabilityMode);
      
      // Handle both datetime and date formats from frontend
      let normalizedStartDate, normalizedEndDate;
      
      // Determine which format is being sent
      const useDateTime = start_datetime && end_datetime;
      const actualStartDate = useDateTime ? start_datetime : start_date;
      const actualEndDate = useDateTime ? end_datetime : end_date;
      
      console.log('Format detection:');
      console.log('- useDateTime:', useDateTime);
      console.log('- actualStartDate:', actualStartDate);
      console.log('- actualEndDate:', actualEndDate);
      
      try {
        // Handle start_date/start_datetime
        if (!actualStartDate || typeof actualStartDate !== 'string') {
          return res.status(400).json({
            status: 'error',
            message: 'Invalid start date format'
          });
        }
        
        // Normalize actualStartDate to YYYY-MM-DD format
        if (/^\d{4}-\d{2}-\d{2}$/.test(actualStartDate)) {
          normalizedStartDate = actualStartDate;
        } else if (actualStartDate.includes('T')) {
          normalizedStartDate = actualStartDate.split('T')[0];
        } else {
          const testDate = new Date(actualStartDate + 'T12:00:00');
          if (isNaN(testDate.getTime())) {
            return res.status(400).json({
              status: 'error',
              message: 'Invalid start date format'
            });
          }
          const year = testDate.getFullYear();
          const month = String(testDate.getMonth() + 1).padStart(2, '0');
          const day = String(testDate.getDate()).padStart(2, '0');
          normalizedStartDate = `${year}-${month}-${day}`;
        }
        
        // Handle end_date/end_datetime
        if (!actualEndDate || typeof actualEndDate !== 'string') {
          return res.status(400).json({
            status: 'error',
            message: 'Invalid end date format'
          });
        }
        
        // Normalize actualEndDate to YYYY-MM-DD format
        if (/^\d{4}-\d{2}-\d{2}$/.test(actualEndDate)) {
          normalizedEndDate = actualEndDate;
        } else if (actualEndDate.includes('T')) {
          normalizedEndDate = actualEndDate.split('T')[0];
        } else {
          const testDate = new Date(actualEndDate + 'T12:00:00');
          if (isNaN(testDate.getTime())) {
            return res.status(400).json({
              status: 'error',
              message: 'Invalid end date format'
            });
          }
          const year = testDate.getFullYear();
          const month = String(testDate.getMonth() + 1).padStart(2, '0');
          const day = String(testDate.getDate()).padStart(2, '0');
          normalizedEndDate = `${year}-${month}-${day}`;
        }
        
        // Allow any start/end date combination - no validation needed
      } catch (err) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid date format: ' + err.message
        });
      }
      
      // Handle time-specific blocking vs full-day blocking
      let startDateTime, endDateTime;
      
      // Check if start_date includes time information
      if (typeof start_date === 'string' && start_date.includes('T')) {
        // Time-specific blocking - use the provided datetime
        startDateTime = start_date.split('.')[0].replace('Z', '');
      } else {
        // Full-day blocking - start at beginning of day
        startDateTime = `${normalizedStartDate}T00:00:00`;
      }
      
      if (typeof end_date === 'string' && end_date.includes('T')) {
        // Time-specific blocking - use the provided datetime
        endDateTime = end_date.split('.')[0].replace('Z', '');
      } else {
        // Full-day blocking - end at end of day
        endDateTime = `${normalizedEndDate}T23:59:59`;
      }
      

      
      // Check for conflicts with existing bookings
      const bookings = await db.query(`
        SELECT * FROM bookings 
        WHERE listing_id = ? AND status IN ('pending', 'confirmed')
        AND (
          (start_datetime <= ? AND end_datetime >= ?) OR
          (start_datetime <= ? AND end_datetime >= ?) OR
          (start_datetime >= ? AND end_datetime <= ?)
        )
      `, [listingId, startDateTime, startDateTime, endDateTime, endDateTime, startDateTime, endDateTime]);
      
      if (bookings.length > 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Cannot block dates that have existing bookings'
        });
      }
      
      // Check if we're blocking multiple days
      const startDateObj = new Date(normalizedStartDate + 'T12:00:00'); // Use noon to avoid timezone issues
      const endDateObj = new Date(normalizedEndDate + 'T12:00:00');
      const dayDiff = Math.floor((endDateObj.getTime() - startDateObj.getTime()) / (24 * 60 * 60 * 1000));
      
      // Check if this is a time-specific block within a single day
      const isTimeSpecificBlock = (typeof start_date === 'string' && start_date.includes('T')) ||
                                  (typeof end_date === 'string' && end_date.includes('T'));
      
      // If we're blocking multiple days AND it's not a datetime-based request, handle accordingly
      // Skip this logic if we have datetime fields (useDateTime = true) as those should go to the new logic
      if (dayDiff > 0 && !isTimeSpecificBlock && !useDateTime) {
        const blockedDates = [];
        
        // Start a transaction
        const connection = await db.getPool().getConnection();
        await connection.beginTransaction();
        
        try {
          // For each day in the range
          for (let i = 0; i <= dayDiff; i++) {
            // Calculate current date by adding days to start date
            const currentDateObj = new Date(startDateObj);
            currentDateObj.setDate(currentDateObj.getDate() + i);
            const year = currentDateObj.getFullYear();
            const month = String(currentDateObj.getMonth() + 1).padStart(2, '0');
            const day = String(currentDateObj.getDate()).padStart(2, '0');
            const currentDateStr = `${year}-${month}-${day}`;
            
            // Create datetime strings for this day
            const currentStartTime = `${currentDateStr}T00:00:00`;
            const currentEndTime = `${currentDateStr}T23:59:59`;
            
            // Add blocked date for this day
            const [result] = await connection.query(
              'INSERT INTO blocked_dates (listing_id, start_datetime, end_datetime, reason) VALUES (?, ?, ?, ?)',
              [listingId, currentStartTime, currentEndTime, reason || null]
            );
            
            // Get created blocked date
            const [blockedDate] = await connection.query(
              'SELECT * FROM blocked_dates WHERE id = ?',
              [result.insertId]
            );
            
            blockedDates.push({
              id: blockedDate.id,
              type: 'blocked',
              startDate: blockedDate.start_datetime,
              endDate: blockedDate.end_datetime,
              reason: blockedDate.reason || ''
            });
          }
          
          await connection.commit();
          
          res.status(201).json({
            status: 'success',
            data: blockedDates
          });
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }
      } else if (availabilityMode === 'available-by-default') {
        console.log('🔄 Processing available-by-default mode blocking');
        
        if (useDateTime) {
          console.log('📅 DateTime-based blocking');
          
          // Check if there's an existing blocked date that overlaps
          console.log('🔍 Checking for existing overlapping blocks...');
          const [existingBlock] = await db.query(
            `SELECT * FROM blocked_dates 
             WHERE listing_id = ? 
             AND (
               (start_datetime <= ? AND end_datetime >= ?) OR
               (start_datetime <= ? AND end_datetime >= ?) OR
               (start_datetime >= ? AND end_datetime <= ?)
             )`,
            [listingId, actualStartDate, actualStartDate, actualEndDate, actualEndDate, actualStartDate, actualEndDate]
          );
          
          console.log('Existing block found:', !!existingBlock);
          if (existingBlock) {
            console.log('Existing block details:', existingBlock);
          }
          
          if (existingBlock) {
            console.log('🔄 Updating existing blocked date');
            // Update existing blocked date
            await db.query(
              'UPDATE blocked_dates SET start_datetime = ?, end_datetime = ?, reason = ?, is_overnight = ?, primary_date = ? WHERE id = ?',
              [actualStartDate, actualEndDate, reason || null, is_overnight || false, primary_date || null, existingBlock.id]
            );
            
            const responseData = {
              status: 'success',
              message: 'Blocked date updated successfully',
              data: {
                id: existingBlock.id,
                listing_id: listingId,
                start_datetime: actualStartDate,
                end_datetime: actualEndDate,
                reason: reason || null,
                is_overnight: is_overnight || false,
                primary_date: primary_date || null
              }
            };
            console.log('✅ Update response:', JSON.stringify(responseData, null, 2));
            res.status(201).json(responseData);
          } else {
            console.log('➕ Inserting new blocked date');
            // Insert new blocked date record with exact datetime and overnight support
            const insertData = {
              listing_id: listingId,
              start_datetime: actualStartDate,
              end_datetime: actualEndDate,
              reason: reason || null,
              is_overnight: is_overnight || false,
              primary_date: primary_date || null
            };
            console.log('Insert data:', JSON.stringify(insertData, null, 2));
            
            const result = await db.insert('blocked_dates', insertData);
            console.log('Insert result:', result);
            
            const responseData = {
              status: 'success',
              message: 'Blocked date added successfully',
              data: {
                id: result.insertId,
                listing_id: listingId,
                start_datetime: actualStartDate,
                end_datetime: actualEndDate,
                reason: reason || null,
                is_overnight: is_overnight || false,
                primary_date: primary_date || null
              }
            };
            console.log('✅ Insert response:', JSON.stringify(responseData, null, 2));
            res.status(201).json(responseData);
          }
        } else {
          // Handle date-only blocking (full day blocking)
          const startDateObj = new Date(normalizedStartDate + 'T12:00:00');
          const endDateObj = new Date(normalizedEndDate + 'T12:00:00');
          const dayDiff = Math.floor((endDateObj.getTime() - startDateObj.getTime()) / (24 * 60 * 60 * 1000));
          
          if (dayDiff > 0) {
            // Multi-day blocking
            const connection = await db.getPool().getConnection();
            await connection.beginTransaction();
            
            try {
              const addedBlocks = [];
              
              for (let i = 0; i <= dayDiff; i++) {
                const currentDateObj = new Date(startDateObj);
                currentDateObj.setDate(currentDateObj.getDate() + i);
                const year = currentDateObj.getFullYear();
                const month = String(currentDateObj.getMonth() + 1).padStart(2, '0');
                const day = String(currentDateObj.getDate()).padStart(2, '0');
                const formattedDate = `${year}-${month}-${day}`;
                
                const startDateTime = `${formattedDate}T00:00:00`;
                const endDateTime = `${formattedDate}T23:59:59`;
                
                const [result] = await connection.query(
                  'INSERT INTO blocked_dates (listing_id, start_datetime, end_datetime, reason, is_overnight, primary_date) VALUES (?, ?, ?, ?, ?, ?)',
                  [listingId, startDateTime, endDateTime, reason || null, false, null]
                );
                
                addedBlocks.push({
                  id: result.insertId,
                  listing_id: listingId,
                  start_datetime: startDateTime,
                  end_datetime: endDateTime,
                  reason: reason || null
                });
              }
              
              await connection.commit();
              
              res.status(201).json({
                status: 'success',
                data: addedBlocks
              });
            } catch (error) {
              await connection.rollback();
              throw error;
            } finally {
              connection.release();
            }
          } else {
            // Single day blocking
            const startDateTime = `${normalizedStartDate}T00:00:00`;
            const endDateTime = `${normalizedStartDate}T23:59:59`;
            
            const result = await db.insert('blocked_dates', {
              listing_id: listingId,
              start_datetime: startDateTime,
              end_datetime: endDateTime,
              reason: reason || null,
              is_overnight: false,
              primary_date: null
            });
            
            res.status(201).json({
              status: 'success',
              message: 'Blocked date added successfully',
              data: {
                id: result.insertId,
                listing_id: listingId,
                start_datetime: startDateTime,
                end_datetime: endDateTime,
                reason: reason || null,
                is_overnight: false,
                primary_date: null
              }
            });
          }
        }
      } else if (availabilityMode === 'blocked-by-default') {
        // In blocked-by-default mode, blocking dates means removing availability entries
        if (useDateTime) {
          const startDate = actualStartDate.split('T')[0];
          const startTime = actualStartDate.split('T')[1] || '00:00:00';
          const endTime = actualEndDate.split('T')[1] || '23:59:59';
          
          await db.query(
            'DELETE FROM availability WHERE listing_id = ? AND date = ? AND start_time = ? AND end_time = ?',
            [listingId, startDate, startTime, endTime]
          );
          
          res.status(201).json({
            status: 'success',
            message: 'Date blocked successfully (availability removed)',
            data: {
              listing_id: listingId,
              date: startDate,
              start_time: startTime,
              end_time: endTime,
              action: 'availability_removed'
            }
          });
        } else {
          const startDateObj = new Date(normalizedStartDate + 'T12:00:00');
          const endDateObj = new Date(normalizedEndDate + 'T12:00:00');
          const dayDiff = Math.floor((endDateObj.getTime() - startDateObj.getTime()) / (24 * 60 * 60 * 1000));
          
          const removedDates = [];
          
          for (let i = 0; i <= dayDiff; i++) {
            const currentDateObj = new Date(startDateObj);
            currentDateObj.setDate(currentDateObj.getDate() + i);
            const year = currentDateObj.getFullYear();
            const month = String(currentDateObj.getMonth() + 1).padStart(2, '0');
            const day = String(currentDateObj.getDate()).padStart(2, '0');
            const currentDateStr = `${year}-${month}-${day}`;
            
            await db.query(
              'DELETE FROM availability WHERE listing_id = ? AND date = ?',
              [listingId, currentDateStr]
            );
            
            removedDates.push(currentDateStr);
          }
          
          res.status(201).json({
            status: 'success',
            message: 'Dates blocked successfully (availability removed)',
            data: {
              listing_id: listingId,
              blocked_dates: removedDates,
              action: 'availability_removed'
            }
          });
        }
      } else if (useDateTime) {
        // Handle datetime-based blocking (from calendar with specific times) in available-by-default mode
        const result = await db.insert('blocked_dates', {
          listing_id: listingId,
          start_datetime: actualStartDate,
          end_datetime: actualEndDate,
          reason: reason || null,
          is_overnight: is_overnight || false,
          primary_date: primary_date || null
        });
        
        res.status(201).json({
          status: 'success',
          message: 'Blocked date added successfully',
          data: {
            id: result.insertId,
            listing_id: listingId,
            start_datetime: actualStartDate,
            end_datetime: actualEndDate,
            reason: reason || null,
            is_overnight: is_overnight || false,
            primary_date: primary_date || null
          }
        });
      } else {
        // Blocking a single day or time range within a day
        
        // Validate time range if it's time-specific
        if (isTimeSpecificBlock) {
          const startTime = new Date(startDateTime);
          const endTime = new Date(endDateTime);
          
          // Allow any start/end time combination - no validation needed
          
          // Check for overlapping blocked times on the same date
          const dateOnly = startDateTime.split('T')[0];
          const overlappingBlocks = await db.query(
            `SELECT * FROM blocked_dates 
             WHERE listing_id = ? 
             AND DATE(start_datetime) = ? 
             AND (
               (start_datetime <= ? AND end_datetime > ?) OR
               (start_datetime < ? AND end_datetime >= ?) OR
               (start_datetime >= ? AND end_datetime <= ?)
             )`,
            [listingId, dateOnly, startDateTime, startDateTime, endDateTime, endDateTime, startDateTime, endDateTime]
          );
          
          if (overlappingBlocks.length > 0) {
            return res.status(400).json({
              status: 'error',
              message: 'This time range overlaps with existing blocked times'
            });
          }
        }
        
        const result = await db.insert('blocked_dates', {
          listing_id: listingId,
          start_datetime: startDateTime,
          end_datetime: endDateTime,
          reason: reason || null
        });
        
        // Get created blocked date
        const [blockedDate] = await db.query(
          'SELECT * FROM blocked_dates WHERE id = ?',
          [result.insertId]
        );
        
        res.status(201).json({
          status: 'success',
          data: {
            id: blockedDate.id,
            type: 'blocked',
            startDate: blockedDate.start_datetime,
            endDate: blockedDate.end_datetime,
            reason: blockedDate.reason || ''
          }
        });
      }
    } catch (error) {
      console.error('Error adding blocked dates:', error);
      next(errorHandler(error));
    }
  },

  /**
   * Delete a blocked date
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async deleteBlockedDate(req, res, next) {
    try {
      const userId = req.user.id;
      const { listingId, blockId } = req.params;
      
      // Check if listing exists and belongs to user
      const [listing] = await db.query(
        'SELECT * FROM listings WHERE id = ? AND user_id = ?',
        [listingId, userId]
      );
      
      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found or not owned by you'
        });
      }
      
      // Check if blocked date exists and belongs to the listing
      const [blockedDate] = await db.query(
        'SELECT * FROM blocked_dates WHERE id = ? AND listing_id = ?',
        [blockId, listingId]
      );
      
      if (!blockedDate) {
        return res.status(404).json({
          status: 'error',
          message: 'Blocked date not found for this listing'
        });
      }
      
      // Delete blocked date
      await db.query('DELETE FROM blocked_dates WHERE id = ?', [blockId]);
      
      res.status(200).json({
        status: 'success',
        message: 'Blocked date deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting blocked date:', error);
      next(errorHandler(error));
    }
  },

    /**
   * Get availability settings for a specific listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
    async getListingAvailability(req, res, next) {
      try {
        const userId = req.user.id;
        const { listingId } = req.params;
        
        // Check if listing exists and belongs to user
        const [listing] = await db.query(
          'SELECT * FROM listings WHERE id = ? AND user_id = ?',
          [listingId, userId]
        );
        
        if (!listing) {
          return res.status(404).json({
            status: 'error',
            message: 'Listing not found or not owned by you'
          });
        }
        
        // Get availability settings
        const availabilityResults = await db.query(
          'SELECT * FROM availability WHERE listing_id = ? ORDER BY date ASC, start_time ASC',
          [listingId]
        );
        
        // Get availability mode (default is "available-by-default")
        const [availabilityMode] = await db.query(
          'SELECT availability_mode FROM listing_settings WHERE listing_id = ?',
          [listingId]
        );
        
        const mode = availabilityMode?.availability_mode || 'available-by-default';
        
        // Format dates to YYYY-MM-DD format without timezone
        const availability = availabilityResults.map(item => {
          // Extract just the date part in YYYY-MM-DD format
          const dateObj = new Date(item.date);
          const formattedDate = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
          
          return {
            ...item,
            date: formattedDate
          };
        });
        
        res.status(200).json({
          status: 'success',
          data: {
            mode,
            availability
          }
        });
      } catch (error) {
        console.error('Error getting availability:', error);
        next(errorHandler(error));
      }
    },
    
    /**
     * Add availability for a specific listing
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware function
     */
    async addAvailability(req, res, next) {
      try {
        const { listingId } = req.params;
        const { date, start_time, end_time, end_date, is_available, is_overnight, reason, recurring } = req.body;
        
        // Check if listing exists and belongs to user
        const [listing] = await db.query(
          'SELECT * FROM listings WHERE id = ? AND user_id = ?',
          [listingId, req.user.id]
        );
        
        if (!listing) {
          return res.status(404).json({
            status: 'error',
            message: 'Listing not found or not owned by you'
          });
        }

        // Get availability mode for this listing
        const [listingSettings] = await db.query(
          'SELECT availability_mode FROM listing_settings WHERE listing_id = ?',
          [listingId]
        );
        
        const availabilityMode = listingSettings?.availability_mode || 'available-by-default';
        
        // In available-by-default mode, setting availability means removing blocked dates
        // This makes the behavior consistent with blocking dates in blocked-by-default mode
        if (availabilityMode === 'available-by-default') {
          // Extract date and time components
          let targetDate = date;
          if (date.includes('T')) {
            targetDate = date.split('T')[0];
          }
          
          // Remove blocked dates that overlap with this availability slot
          const startDateTime = `${targetDate}T${start_time || '00:00:00'}`;
          const endDateTime = `${targetDate}T${end_time || '23:59:59'}`;
          
          // Remove overlapping blocked dates
          await db.query(
            `DELETE FROM blocked_dates 
             WHERE listing_id = ? 
             AND DATE(start_datetime) = ? 
             AND (
               (start_datetime <= ? AND end_datetime >= ?) OR
               (start_datetime <= ? AND end_datetime >= ?) OR
               (start_datetime >= ? AND end_datetime <= ?)
             )`,
            [listingId, targetDate, startDateTime, startDateTime, endDateTime, endDateTime, startDateTime, endDateTime]
          );
          
          return res.status(201).json({
            status: 'success',
            message: 'Availability set successfully (blocked dates removed)',
            data: {
              listing_id: listingId,
              date: targetDate,
              start_time: start_time || '00:00:00',
              end_time: end_time || '23:59:59',
              action: 'blocked_dates_removed'
            }
          });
        }
        
        // For blocked-by-default mode, continue with normal availability table logic
        // Validate and normalize date without timezone conversion
        let normalizedDate;
        try {
          // Handle the date string directly to avoid timezone issues
          if (!date || typeof date !== 'string') {
            return res.status(400).json({
              status: 'error',
              message: 'Invalid date format'
            });
          }
          
          // If date is already in YYYY-MM-DD format, use it directly
          if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            normalizedDate = date;
          } else if (date.includes('T')) {
            // If date includes time, extract just the date part
            normalizedDate = date.split('T')[0];
          } else {
            // Try to parse and reformat
            const testDate = new Date(date + 'T12:00:00'); // Add noon to avoid timezone issues
            if (isNaN(testDate.getTime())) {
              return res.status(400).json({
                status: 'error',
                message: 'Invalid date format'
              });
            }
            const year = testDate.getFullYear();
            const month = String(testDate.getMonth() + 1).padStart(2, '0');
            const day = String(testDate.getDate()).padStart(2, '0');
            normalizedDate = `${year}-${month}-${day}`;
          }
        } catch (err) {
          return res.status(400).json({
            status: 'error',
            message: 'Invalid date format: ' + err.message
          });
        }
        
        // Check if this is a recurring availability
        let normalizedEndDate;
        if (recurring && end_date) {
          try {
            // Handle the end date string directly to avoid timezone issues
            if (!end_date || typeof end_date !== 'string') {
              return res.status(400).json({
                status: 'error',
                message: 'Invalid end date format for recurring availability'
              });
            }
            
            // If end date is already in YYYY-MM-DD format, use it directly
            if (/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
              normalizedEndDate = end_date;
            } else if (end_date.includes('T')) {
              // If date includes time, extract just the date part
              normalizedEndDate = end_date.split('T')[0];
            } else {
              // Try to parse and reformat
              const testDate = new Date(end_date + 'T12:00:00'); // Add noon to avoid timezone issues
              if (isNaN(testDate.getTime())) {
                return res.status(400).json({
                  status: 'error',
                  message: 'Invalid end date format for recurring availability'
                });
              }
              const year = testDate.getFullYear();
              const month = String(testDate.getMonth() + 1).padStart(2, '0');
              const day = String(testDate.getDate()).padStart(2, '0');
              normalizedEndDate = `${year}-${month}-${day}`;
            }
          } catch (err) {
            return res.status(400).json({
              status: 'error',
              message: 'Invalid end date format: ' + err.message
            });
          }
          
          if (normalizedEndDate < normalizedDate) {
            return res.status(400).json({
              status: 'error',
              message: 'End date must be after start date for recurring availability'
            });
          }
          
          // Get all dates between start and end date based on recurring pattern
          const dates = [];
          let currentDate = new Date(availabilityDate);
          
          while (currentDate <= endRecurringDate) {
            // For weekly recurring, add same day of week
            if (recurring === 'weekly') {
              const dayOfWeek = currentDate.getDay();
              let tempDate = new Date(currentDate);
              
              while (tempDate <= endRecurringDate) {
                dates.push(new Date(tempDate));
                // Add 7 days for next week
                tempDate.setDate(tempDate.getDate() + 7);
              }
              // Move to next day to avoid infinite loop
              currentDate.setDate(currentDate.getDate() + 1);
            } 
            // For daily recurring, add every day
            else if (recurring === 'daily') {
              dates.push(new Date(currentDate));
              currentDate.setDate(currentDate.getDate() + 1);
            }
            // For monthly recurring, add same day of month
            else if (recurring === 'monthly') {
              const dayOfMonth = currentDate.getDate();
              let tempDate = new Date(currentDate);
              
              while (tempDate <= endRecurringDate) {
                dates.push(new Date(tempDate));
                // Add 1 month
                tempDate.setMonth(tempDate.getMonth() + 1);
              }
              // Move to next day to avoid infinite loop
              currentDate.setDate(currentDate.getDate() + 1);
            } else {
              // If not a recognized pattern, just add the single date
              dates.push(new Date(currentDate));
              break;
            }
          }
          
          // Start a transaction
          const connection = await db.getPool().getConnection();
          await connection.beginTransaction();
          
          try {
            const addedAvailabilities = [];
            
            // Add availability for each date
            for (const currentDate of dates) {
              // Convert each date to YYYY-MM-DD format avoiding timezone shifts
              const year = currentDate.getFullYear();
              const month = String(currentDate.getMonth() + 1).padStart(2, '0');
              const day = String(currentDate.getDate()).padStart(2, '0');
              const formattedDate = `${year}-${month}-${day}`;
              
              // Check if there's an existing availability for this date and time
              const [existingAvailability] = await connection.query(
                'SELECT * FROM availability WHERE listing_id = ? AND date = ? AND start_time = ? AND end_time = ?',
                [listingId, formattedDate, start_time, end_time]
              );
              
              if (existingAvailability) {
                // Update existing availability
                await connection.query(
                  'UPDATE availability SET is_available = ? WHERE id = ?',
                  [is_available, existingAvailability.id]
                );
                
                addedAvailabilities.push({
                  id: existingAvailability.id,
                  listing_id: listingId,
                  date: formattedDate,
                  start_time,
                  end_time,
                  is_available
                });
              } else {
                // Add new availability
                const [result] = await connection.query(
                  'INSERT INTO availability (listing_id, date, start_time, end_time, is_available) VALUES (?, ?, ?, ?, ?)',
                  [listingId, formattedDate, start_time, end_time, is_available]
                );
                
                addedAvailabilities.push({
                  id: result.insertId,
                  listing_id: listingId,
                  date: formattedDate,
                  start_time,
                  end_time,
                  is_available
                });
              }
            }
            
            await connection.commit();
            
            res.status(201).json({
              status: 'success',
              data: addedAvailabilities
            });
          } catch (error) {
            await connection.rollback();
            throw error;
          } finally {
            connection.release();
          }
        } else {
          // Single date availability
          // Use the normalized date string directly to avoid any timezone conversion
          const formattedDate = normalizedDate; // Already normalized to YYYY-MM-DD format above
          
          // Check if there's an existing availability for this date and time
          const [existingAvailability] = await db.query(
            'SELECT * FROM availability WHERE listing_id = ? AND date = ? AND start_time = ? AND end_time = ?',
            [listingId, formattedDate, start_time, end_time]
          );
          
          if (existingAvailability) {
            // Update existing availability
            await db.query(
              'UPDATE availability SET is_available = ?, end_date = ?, is_overnight = ?, reason = ? WHERE id = ?',
              [is_available !== false, end_date || null, is_overnight || false, reason || null, existingAvailability.id]
            );
          } else {
            // Insert availability record with overnight support
            await db.insert('availability', {
              listing_id: listingId,
              date: normalizedDate,
              start_time: start_time,
              end_time: end_time,
              end_date: end_date || null,
              is_available: is_available !== false,
              is_overnight: is_overnight || false,
              reason: reason || null
            });
          }
        }
        
        res.status(201).json({
          status: 'success',
          message: 'Availability added successfully',
          data: {
            listing_id: listingId,
            date: normalizedDate,
            start_time,
            end_time,
            end_date: end_date || null,
            is_available: is_available !== false,
            is_overnight: is_overnight || false
          }
        });
      } catch (error) {
        console.error('Error adding availability:', error);
        next(error);
      }
    },
    
    /**
     * Delete availability for a specific listing
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware function
     */
    async deleteAvailability(req, res, next) {
      try {
        const userId = req.user.id;
        const { listingId, availabilityId } = req.params;
        
        // Check if listing exists and belongs to user
        const [listing] = await db.query(
          'SELECT * FROM listings WHERE id = ? AND user_id = ?',
          [listingId, userId]
        );
        
        if (!listing) {
          return res.status(404).json({
            status: 'error',
            message: 'Listing not found or not owned by you'
          });
        }
        
        // Check if availability exists and belongs to the listing
        const [availability] = await db.query(
          'SELECT * FROM availability WHERE id = ? AND listing_id = ?',
          [availabilityId, listingId]
        );
        
        if (!availability) {
          return res.status(404).json({
            status: 'error',
            message: 'Availability not found for this listing'
          });
        }
        
        // Delete availability
        await db.query('DELETE FROM availability WHERE id = ?', [availabilityId]);
        
        res.status(200).json({
          status: 'success',
          message: 'Availability deleted successfully'
        });
      } catch (error) {
        console.error('Error deleting availability:', error);
        next(errorHandler(error));
      }
    },
    
    /**
     * Set availability mode for a specific listing
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware function
     */
    async setAvailabilityMode(req, res, next) {
      try {
        const userId = req.user.id;
        const { listingId } = req.params;
        const { mode } = req.body;
        
        // Validate mode
        if (!['available-by-default', 'blocked-by-default'].includes(mode)) {
          return res.status(400).json({
            status: 'error',
            message: 'Invalid availability mode. Must be "available-by-default" or "blocked-by-default"'
          });
        }
        
        // Check if listing exists and belongs to user
        const [listing] = await db.query(
          'SELECT * FROM listings WHERE id = ? AND user_id = ?',
          [listingId, userId]
        );
        
        if (!listing) {
          return res.status(404).json({
            status: 'error',
            message: 'Listing not found or not owned by you'
          });
        }
        
        // Check if listing settings exist
        const [existingSettings] = await db.query(
          'SELECT * FROM listing_settings WHERE listing_id = ?',
          [listingId]
        );
        
        if (existingSettings) {
          // Update existing settings
          await db.query(
            'UPDATE listing_settings SET availability_mode = ? WHERE listing_id = ?',
            [mode, listingId]
          );
        } else {
          // Create new settings
          await db.query(
            'INSERT INTO listing_settings (listing_id, availability_mode) VALUES (?, ?)',
            [listingId, mode]
          );
        }
        
        res.status(200).json({
          status: 'success',
          data: {
            listing_id: listingId,
            availability_mode: mode
          }
        });
      } catch (error) {
        console.error('Error setting availability mode:', error);
        next(errorHandler(error));
      }
    },
     /**
   * Toggle active status for a listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async toggleListingStatus(req, res, next) {
    try {
      const userId = req.user.id;
      const { listingId } = req.params;
      const { is_active } = req.body;
      
      // Check if listing exists and belongs to user
      const [listing] = await db.query(
        'SELECT * FROM listings WHERE id = ? AND user_id = ?',
        [listingId, userId]
      );
      
      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found or not owned by you'
        });
      }
      
      // Update listing status
      await db.query(
        'UPDATE listings SET active = ? WHERE id = ?',
        [is_active ? 1 : 0, listingId]
      );
      
      res.status(200).json({
        status: 'success',
        data: {
          id: listingId,
          is_active: is_active
        }
      });
    } catch (error) {
      console.error('Error toggling listing status:', error);
      next(errorHandler(error));
    }
  }

};

module.exports = hostController; 