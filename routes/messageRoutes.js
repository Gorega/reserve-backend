const express = require('express');
const messageController = require('../controllers/messageController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// All message routes require authentication
router.use(authMiddleware.protect);

// Message routes
router.post('/conversations', messageController.createConversation);
router.get('/conversations', messageController.getUserConversations);
router.get('/conversations/:userId', messageController.getConversation);
router.post('/conversations/:userId/messages', messageController.sendMessage);
router.post('/conversations/:userId/read', messageController.markAsRead);

// Unread messages count
router.get('/unread-count', messageController.getUnreadCount);

module.exports = router; 