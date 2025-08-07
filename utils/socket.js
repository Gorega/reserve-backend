const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Map to store active user connections
const connectedUsers = new Map();

module.exports = (io) => {
  // Middleware for authentication
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || 
                   socket.handshake.query.token;
      
      if (!token) {
        return next(new Error('Authentication error: Token required'));
      }

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Check if user exists
      const user = await db.getById('users', decoded.id);
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }
      
      // Attach user data to socket
      socket.user = {
        id: user.id,
        name: user.name,
        email: user.email
      };
      
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.id}`);
    
    // Store user connection
    connectedUsers.set(socket.user.id.toString(), socket.id);
    
    // Join a room specific to the user
    socket.join(`user_${socket.user.id}`);
    
    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.id}`);
      connectedUsers.delete(socket.user.id.toString());
    });
    
    // Handle joining a conversation
    socket.on('join_conversation', (userId) => {
      const roomName = getConversationRoom(socket.user.id, userId);
      socket.join(roomName);
      console.log(`User ${socket.user.id} joined conversation with ${userId}`);
    });
    
    // Handle leaving a conversation
    socket.on('leave_conversation', (userId) => {
      const roomName = getConversationRoom(socket.user.id, userId);
      socket.leave(roomName);
      console.log(`User ${socket.user.id} left conversation with ${userId}`);
    });
  });
  
  // Helper function to get conversation room name
  function getConversationRoom(user1Id, user2Id) {
    // Sort IDs to ensure consistent room names regardless of who initiates
    const sortedIds = [user1Id, user2Id].sort();
    return `conversation_${sortedIds[0]}_${sortedIds[1]}`;
  }
  
  // Helper function to check if user is online
  function isUserOnline(userId) {
    return connectedUsers.has(userId.toString());
  }
  
  // Helper function to send notification to a specific user
  function sendNotification(userId, type, data) {
    io.to(`user_${userId}`).emit('notification', { type, data });
  }
  
  // Helper function to send a message to a conversation
  function sendMessageToConversation(senderId, receiverId, message) {
    const roomName = getConversationRoom(senderId, receiverId);
    io.to(roomName).emit('new_message', message);
    
    // Also send notification to the receiver if they're not in the conversation room
    sendNotification(receiverId, 'new_message', {
      senderId,
      message: {
        content: message.message,
        sender_id: message.sender_id,
        id: message.id
      }
    });
  }
  
  // Expose socket utilities
  io.socketUtils = {
    isUserOnline,
    sendNotification,
    sendMessageToConversation,
    getConversationRoom
  };
  
  return io;
}; 