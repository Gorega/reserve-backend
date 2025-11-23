const db = require('../config/database');
const { errorHandler } = require('../utils/errorHandler');

// Create a new conversation and optional first message
exports.createConversation = async (req, res, next) => {
  try {
    const { recipientId, listingId, initialMessage } = req.body;

    // Check if recipient exists
    const recipient = await db.getById('users', recipientId);
    if (!recipient) {
      return res.status(404).json({
        status: 'error',
        message: 'Recipient not found'
      });
    }

    // Check if listing exists if provided
    if (listingId) {
      const listing = await db.getById('listings', listingId);
      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found'
        });
      }
    }

    // For MySQL, we don't need a separate conversation table
    // We'll just create the first message directly
    if (!initialMessage) {
      return res.status(400).json({
        status: 'error',
        message: 'Initial message is required'
      });
    }

    // Create message
    const messageData = {
      sender_id: req.user.id,
      receiver_id: recipientId,
      listing_id: listingId || null,
      message: initialMessage,
      is_read: false
    };

    // Try to insert with is_read field, fall back if it doesn't exist
    let result;
    try {
      result = await db.insert('messages', messageData);
    } catch (error) {
      // If error is about is_read column, try without it
      if (error.code === 'ER_BAD_FIELD_ERROR' && error.message.includes('is_read')) {
        delete messageData.is_read;
        result = await db.insert('messages', messageData);
      } else {
        throw error;
      }
    }
    
    // Get the created message
    const message = await db.getById('messages', result.insertId);

    // Send real-time notification using Socket.io
    if (req.io && req.io.socketUtils) {
      req.io.socketUtils.sendMessageToConversation(
        req.user.id,
        recipientId,
        message
      );
      
      // Send notification to recipient
      req.io.socketUtils.sendNotification(recipientId, 'new_message', {
        senderId: req.user.id,
        message: {
          id: message.id,
          content: message.message
        }
      });
    }

    res.status(201).json({
      status: 'success',
      data: {
        message
      }
    });
  } catch (error) {
    next(errorHandler(error));
  }
};

// Get all conversations for a user
exports.getUserConversations = async (req, res, next) => {
  try {
    // In MySQL, we need to get unique conversation partners
    // Fixed query to comply with ONLY_FULL_GROUP_BY mode
  const conversations = await db.query(`
      SELECT 
        u.id as user_id,
        u.name,
        u.profile_image,
        (
          SELECT l2.id
          FROM messages m2
          LEFT JOIN listings l2 ON m2.listing_id = l2.id
          WHERE (m2.sender_id = ? AND m2.receiver_id = u.id) OR (m2.sender_id = u.id AND m2.receiver_id = ?)
            AND m2.listing_id IS NOT NULL
          ORDER BY COALESCE(m2.sent_at, m2.created_at) DESC
          LIMIT 1
        ) as listing_id,
        (
          SELECT l2.title
          FROM messages m2
          LEFT JOIN listings l2 ON m2.listing_id = l2.id
          WHERE (m2.sender_id = ? AND m2.receiver_id = u.id) OR (m2.sender_id = u.id AND m2.receiver_id = ?)
            AND m2.listing_id IS NOT NULL
          ORDER BY COALESCE(m2.sent_at, m2.created_at) DESC
          LIMIT 1
        ) as listing_title,
        (
          SELECT image_url 
          FROM listing_photos lp
          WHERE lp.listing_id = (
            SELECT l3.id
            FROM messages m3
            LEFT JOIN listings l3 ON m3.listing_id = l3.id
            WHERE (m3.sender_id = ? AND m3.receiver_id = u.id) OR (m3.sender_id = u.id AND m3.receiver_id = ?)
              AND m3.listing_id IS NOT NULL
            ORDER BY COALESCE(m3.sent_at, m3.created_at) DESC
            LIMIT 1
          )
          AND lp.is_cover = 1
          LIMIT 1
        ) as listing_image,
        (
          SELECT m.message 
          FROM messages m 
          WHERE 
            (m.sender_id = ? AND m.receiver_id = u.id) OR 
            (m.sender_id = u.id AND m.receiver_id = ?) 
          ORDER BY COALESCE(m.sent_at, m.created_at) DESC 
          LIMIT 1
        ) as last_message,
        (
          SELECT COALESCE(m.sent_at, m.created_at) 
          FROM messages m 
          WHERE 
            (m.sender_id = ? AND m.receiver_id = u.id) OR 
            (m.sender_id = u.id AND m.receiver_id = ?) 
          ORDER BY COALESCE(m.sent_at, m.created_at) DESC 
          LIMIT 1
        ) as last_message_time,
        (
          SELECT COUNT(*) 
          FROM messages m 
          WHERE 
            m.sender_id = u.id AND 
            m.receiver_id = ? AND
            (m.is_read = 0 OR m.is_read IS NULL)
        ) as unread_count
      FROM users u
      JOIN messages m ON (m.sender_id = u.id AND m.receiver_id = ?) OR (m.receiver_id = u.id AND m.sender_id = ?)
      GROUP BY u.id, u.name, u.profile_image
      ORDER BY last_message_time DESC
    `, [
      req.user.id, req.user.id,
      req.user.id, req.user.id,
      req.user.id, req.user.id,
      req.user.id, req.user.id,
      req.user.id, req.user.id,
      req.user.id,
      req.user.id, req.user.id
    ]).catch(error => {
      // If error is about is_read column, try without it
      if (error.code === 'ER_BAD_FIELD_ERROR' && error.message.includes('is_read')) {
        return db.query(`
          SELECT 
            u.id as user_id,
            u.name,
            u.profile_image,
            (
              SELECT l2.id
              FROM messages m2
              LEFT JOIN listings l2 ON m2.listing_id = l2.id
              WHERE (m2.sender_id = ? AND m2.receiver_id = u.id) OR (m2.sender_id = u.id AND m2.receiver_id = ?)
                AND m2.listing_id IS NOT NULL
              ORDER BY COALESCE(m2.sent_at, m2.created_at) DESC
              LIMIT 1
            ) as listing_id,
            (
              SELECT l2.title
              FROM messages m2
              LEFT JOIN listings l2 ON m2.listing_id = l2.id
              WHERE (m2.sender_id = ? AND m2.receiver_id = u.id) OR (m2.sender_id = u.id AND m2.receiver_id = ?)
                AND m2.listing_id IS NOT NULL
              ORDER BY COALESCE(m2.sent_at, m2.created_at) DESC
              LIMIT 1
            ) as listing_title,
            (
              SELECT image_url 
              FROM listing_photos lp
              WHERE lp.listing_id = (
                SELECT l3.id
                FROM messages m3
                LEFT JOIN listings l3 ON m3.listing_id = l3.id
                WHERE (m3.sender_id = ? AND m3.receiver_id = u.id) OR (m3.sender_id = u.id AND m3.receiver_id = ?)
                  AND m3.listing_id IS NOT NULL
                ORDER BY COALESCE(m3.sent_at, m3.created_at) DESC
                LIMIT 1
              )
              AND lp.is_cover = 1
              LIMIT 1
            ) as listing_image,
            (
              SELECT m.message 
              FROM messages m 
              WHERE 
                (m.sender_id = ? AND m.receiver_id = u.id) OR 
                (m.sender_id = u.id AND m.receiver_id = ?) 
              ORDER BY COALESCE(m.sent_at, m.created_at) DESC 
              LIMIT 1
            ) as last_message,
            (
              SELECT COALESCE(m.sent_at, m.created_at) 
              FROM messages m 
              WHERE 
                (m.sender_id = ? AND m.receiver_id = u.id) OR 
                (m.sender_id = u.id AND m.receiver_id = ?) 
              ORDER BY COALESCE(m.sent_at, m.created_at) DESC 
              LIMIT 1
            ) as last_message_time,
            (
              SELECT COUNT(*) 
              FROM messages m 
              WHERE 
                m.sender_id = u.id AND 
                m.receiver_id = ?
            ) as unread_count
          FROM users u
          JOIN messages m ON (m.sender_id = u.id AND m.receiver_id = ?) OR (m.receiver_id = u.id AND m.sender_id = ?)
          GROUP BY u.id, u.name, u.profile_image
          ORDER BY last_message_time DESC
        `, [
          req.user.id, req.user.id,
          req.user.id, req.user.id,
          req.user.id, req.user.id,
          req.user.id, req.user.id,
          req.user.id, req.user.id,
          req.user.id,
          req.user.id, req.user.id
        ]);
      }
      throw error;
    });

    // Add online status if socket.io is available
    if (req.io && req.io.socketUtils) {
      conversations.forEach(convo => {
        convo.is_online = req.io.socketUtils.isUserOnline(convo.user_id);
      });
    }

    res.status(200).json({
      status: 'success',
      results: conversations.length,
      data: {
        conversations
      }
    });
  } catch (error) {
    next(errorHandler(error));
  }
};

// Get conversation with a specific user
exports.getConversation = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Check if the other user exists
    const otherUser = await db.getById('users', userId);
    if (!otherUser) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Get messages between the two users
    const messages = await db.query(`
      SELECT m.*, 
        u_sender.name as sender_name, 
        u_sender.profile_image as sender_image,
        u_receiver.name as receiver_name,
        u_receiver.profile_image as receiver_image
      FROM messages m
      JOIN users u_sender ON m.sender_id = u_sender.id
      JOIN users u_receiver ON m.receiver_id = u_receiver.id
      WHERE 
        (m.sender_id = ? AND m.receiver_id = ?) OR
        (m.sender_id = ? AND m.receiver_id = ?)
      ORDER BY m.sent_at ASC
    `, [req.user.id, userId, userId, req.user.id]);

    // Mark messages as read
    try {
      await db.query(`
        UPDATE messages
        SET is_read = 1
        WHERE sender_id = ? AND receiver_id = ? AND is_read = 0
      `, [userId, req.user.id]);
    } catch (error) {
      // Continue execution even if this fails
    }

    // If socket.io is available, join the conversation room
    if (req.io && req.io.socketUtils) {
      // Emit event that messages have been read
      req.io.to(`user_${userId}`).emit('messages_read', {
        conversationId: req.io.socketUtils.getConversationRoom(req.user.id, userId),
        readBy: req.user.id
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        messages
      }
    });
  } catch (error) {
    next(errorHandler(error));
  }
};

// Send a message to a user
exports.sendMessage = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { message, listingId } = req.body;

    // Check if recipient exists
    const recipient = await db.getById('users', userId);
    if (!recipient) {
      return res.status(404).json({
        status: 'error',
        message: 'Recipient not found'
      });
    }

    // Check if listing exists if provided
    if (listingId) {
      const listing = await db.getById('listings', listingId);
      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Listing not found'
        });
      }
    }

    // Create message
    const messageData = {
      sender_id: req.user.id,
      receiver_id: userId,
      listing_id: listingId || null,
      message,
      is_read: false
    };

    // Try to insert with is_read field, fall back if it doesn't exist
    let result;
    try {
      result = await db.insert('messages', messageData);
    } catch (error) {
      // If error is about is_read column, try without it
      if (error.code === 'ER_BAD_FIELD_ERROR' && error.message.includes('is_read')) {
        delete messageData.is_read;
        result = await db.insert('messages', messageData);
      } else {
        throw error;
      }
    }
    
    // Get the created message
    const newMessage = await db.getById('messages', result.insertId);

    // Send real-time notification using Socket.io
    if (req.io && req.io.socketUtils) {
      req.io.socketUtils.sendMessageToConversation(
        req.user.id,
        userId,
        newMessage
      );
    }

    res.status(201).json({
      status: 'success',
      data: {
        message: newMessage
      }
    });
  } catch (error) {
    next(errorHandler(error));
  }
};

// Get unread message count
exports.getUnreadCount = async (req, res, next) => {
  try {
    // Use is_read column for unread count
    try {
      const [result] = await db.query(`
        SELECT COUNT(*) as unread_count
        FROM messages
        WHERE receiver_id = ? AND is_read = 0
      `, [req.user.id]);

      res.status(200).json({
        status: 'success',
        data: {
          unreadCount: result.unread_count
        }
      });
    } catch (error) {
      // Fallback if is_read column doesn't exist
      const [result] = await db.query(`
        SELECT COUNT(*) as unread_count
        FROM messages
        WHERE receiver_id = ?
      `, [req.user.id]);

      res.status(200).json({
        status: 'success',
        data: {
          unreadCount: result.unread_count
        }
      });
    }
  } catch (error) {
    next(errorHandler(error));
  }
};

// Mark messages as read
exports.markAsRead = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Update is_read status
    try {
      await db.query(`
        UPDATE messages
        SET is_read = 1
        WHERE sender_id = ? AND receiver_id = ? AND is_read = 0
      `, [userId, req.user.id]);
    } catch (error) {
      // Continue execution even if this fails
    }

    // If socket.io is available, emit event that messages have been read
    if (req.io && req.io.socketUtils) {
      req.io.to(`user_${userId}`).emit('messages_read', {
        conversationId: req.io.socketUtils.getConversationRoom(req.user.id, userId),
        readBy: req.user.id
      });
    }

    res.status(200).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    next(errorHandler(error));
  }
}; 
