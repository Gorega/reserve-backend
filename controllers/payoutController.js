const db = require('../config/database');
const { errorHandler } = require('../utils/errorHandler');

// Request a payout (for hosts)
exports.requestPayout = async (req, res, next) => {
  try {
    const { bookingId, payoutMethod } = req.body;

    // Check if booking exists and belongs to the host
    const [booking] = await db.query(`
      SELECT b.*, l.user_id as provider_id 
      FROM bookings b
      JOIN listings l ON b.listing_id = l.id
      WHERE b.id = ?
    `, [bookingId]);
    
    if (!booking) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found'
      });
    }

    // Verify the user is the host of the listing
    if (booking.provider_id !== req.user.id) {
      return res.status(403).json({
        status: 'error',
        message: 'You are not authorized to request a payout for this booking'
      });
    }

    // Check if booking is completed
    if (booking.status !== 'completed') {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot request payout for a booking that is not completed'
      });
    }

    // Check if payout already exists for this booking
    const [existingPayout] = await db.query(
      'SELECT * FROM payouts WHERE booking_id = ?',
      [bookingId]
    );
    
    if (existingPayout) {
      return res.status(400).json({
        status: 'error',
        message: 'A payout for this booking already exists',
        data: {
          payout: existingPayout
        }
      });
    }

    // Create payout request
    const payoutData = {
      provider_id: req.user.id,
      booking_id: bookingId,
      amount: booking.provider_earnings,
      status: 'pending',
      payout_method: payoutMethod
    };

    const result = await db.insert('payouts', payoutData);
    
    // Get the created payout
    const payout = await db.getById('payouts', result.insertId);

    res.status(201).json({
      status: 'success',
      data: {
        payout
      }
    });
  } catch (error) {
    next(errorHandler(error));
  }
};

// Get all payouts for a host
exports.getHostPayouts = async (req, res, next) => {
  try {
    const payouts = await db.query(`
      SELECT p.*, b.total_price, l.title as listing_title
      FROM payouts p
      JOIN bookings b ON p.booking_id = b.id
      JOIN listings l ON b.listing_id = l.id
      WHERE p.provider_id = ?
      ORDER BY p.created_at DESC
    `, [req.user.id]);

    res.status(200).json({
      status: 'success',
      results: payouts.length,
      data: {
        payouts
      }
    });
  } catch (error) {
    next(errorHandler(error));
  }
};

// Get a single payout by ID
exports.getPayout = async (req, res, next) => {
  try {
    const [payout] = await db.query(`
      SELECT p.*, b.total_price, b.start_datetime, b.end_datetime,
             l.title as listing_title, l.location
      FROM payouts p
      JOIN bookings b ON p.booking_id = b.id
      JOIN listings l ON b.listing_id = l.id
      WHERE p.id = ?
    `, [req.params.id]);

    if (!payout) {
      return res.status(404).json({
        status: 'error',
        message: 'Payout not found'
      });
    }

    // Check if payout belongs to user or user is admin
    if (payout.provider_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'You are not authorized to access this payout'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        payout
      }
    });
  } catch (error) {
    next(errorHandler(error));
  }
};

// Update payout status (admin only)
exports.updatePayoutStatus = async (req, res, next) => {
  try {
    const { status, notes } = req.body;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'You are not authorized to update payout status'
      });
    }

    const payout = await db.getById('payouts', req.params.id);

    if (!payout) {
      return res.status(404).json({
        status: 'error',
        message: 'Payout not found'
      });
    }

    // Update payout
    const updateData = { status };
    
    if (notes) {
      updateData.notes = notes;
    }
    
    if (status === 'paid') {
      updateData.payout_date = new Date();
    }

    await db.update('payouts', req.params.id, updateData);

    // Get updated payout
    const updatedPayout = await db.getById('payouts', req.params.id);

    res.status(200).json({
      status: 'success',
      data: {
        payout: updatedPayout
      }
    });
  } catch (error) {
    next(errorHandler(error));
  }
};

// Get all payouts (admin only)
exports.getAllPayouts = async (req, res, next) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'You are not authorized to access all payouts'
      });
    }

    const payouts = await db.query(`
      SELECT p.*, u.name as provider_name, u.email as provider_email,
             b.total_price, l.title as listing_title
      FROM payouts p
      JOIN users u ON p.provider_id = u.id
      JOIN bookings b ON p.booking_id = b.id
      JOIN listings l ON b.listing_id = l.id
      ORDER BY p.created_at DESC
    `);

    res.status(200).json({
      status: 'success',
      results: payouts.length,
      data: {
        payouts
      }
    });
  } catch (error) {
    next(errorHandler(error));
  }
}; 