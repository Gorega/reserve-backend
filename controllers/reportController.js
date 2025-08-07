const db = require('../config/database');
const { errorHandler, notFound, badRequest } = require('../utils/errorHandler');

/**
 * Report Controller
 * Handles HTTP requests for listing reports
 */
const reportController = {
  /**
   * Report a listing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async reportListing(req, res, next) {
    try {
      const { listingId } = req.params;
      const userId = req.user.id;
      const { reason, description } = req.body;
      
      // Check if listing exists
      const listing = await db.getById('listings', listingId);
      
      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found'
        });
      }
      
      // Check if user has already reported this listing
      const [existingReport] = await db.query(
        'SELECT * FROM listing_reports WHERE listing_id = ? AND user_id = ? AND status != "dismissed"',
        [listingId, userId]
      );
      
      if (existingReport) {
        return res.status(400).json({
          status: 'error',
          message: 'You have already reported this listing'
        });
      }
      
      // Create report
      const reportData = {
        listing_id: listingId,
        user_id: userId,
        reason,
        description,
        status: 'pending'
      };
      
      const result = await db.insert('listing_reports', reportData);
      
      // Get created report
      const report = await db.getById('listing_reports', result.insertId);
      
      res.status(201).json({
        status: 'success',
        data: report
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Get all reports (admin only)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getAllReports(req, res, next) {
    try {
      // Parse query parameters
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;
      const status = req.query.status;
      
      // Build query
      let query = `
        SELECT lr.*, l.title as listing_title, u.name as reporter_name
        FROM listing_reports lr
        JOIN listings l ON lr.listing_id = l.id
        JOIN users u ON lr.user_id = u.id
      `;
      
      const params = [];
      
      // Add status filter if provided
      if (status) {
        query += ' WHERE lr.status = ?';
        params.push(status);
      }
      
      // Add sorting and pagination
      query += ' ORDER BY lr.created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      const reports = await db.query(query, params);
      
      // Count total reports for pagination
      let countQuery = 'SELECT COUNT(*) as count FROM listing_reports';
      if (status) {
        countQuery += ' WHERE status = ?';
      }
      
      const [countResult] = await db.query(countQuery, status ? [status] : []);
      const totalCount = countResult.count;
      
      res.status(200).json({
        status: 'success',
        results: reports.length,
        totalCount,
        page,
        totalPages: Math.ceil(totalCount / limit),
        data: reports
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Get report by ID (admin only)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getReportById(req, res, next) {
    try {
      const { id } = req.params;
      
      const [report] = await db.query(`
        SELECT lr.*, l.title as listing_title, l.description as listing_description,
          u.name as reporter_name, u.email as reporter_email
        FROM listing_reports lr
        JOIN listings l ON lr.listing_id = l.id
        JOIN users u ON lr.user_id = u.id
        WHERE lr.id = ?
      `, [id]);
      
      if (!report) {
        return res.status(404).json({
          status: 'error',
          message: 'Report not found'
        });
      }
      
      res.status(200).json({
        status: 'success',
        data: report
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Update report status (admin only)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updateReportStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      // Check if report exists
      const report = await db.getById('listing_reports', id);
      
      if (!report) {
        return res.status(404).json({
          status: 'error',
          message: 'Report not found'
        });
      }
      
      // Update report status
      const updateData = {
        status,
        resolved_at: status === 'resolved' ? new Date() : null
      };
      
      await db.update('listing_reports', id, updateData);
      
      // Get updated report
      const updatedReport = await db.getById('listing_reports', id);
      
      res.status(200).json({
        status: 'success',
        data: updatedReport
      });
    } catch (error) {
      next(errorHandler(error));
    }
  }
};

module.exports = reportController; 