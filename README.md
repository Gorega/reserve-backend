# Reservation System Backend

A powerful and flexible reservation system backend built with Node.js, Express, and MySQL.

## Features

- User authentication and authorization
- Listing management with photos and availability
- Booking system with payment processing
- Reviews and messaging
- Category management
- Provider payouts
- Wishlists

## Tech Stack

- **Node.js** - JavaScript runtime
- **Express** - Web framework
- **MySQL** - Database
- **JWT** - Authentication
- **Bcrypt** - Password hashing
- **Multer** - File uploads

## Project Structure

```
reserve-backend/
├── src/
│   ├── config/          # Configuration files
│   ├── controllers/     # Request handlers
│   ├── middleware/      # Express middleware
│   ├── models/          # Database models
│   ├── routes/          # API routes
│   ├── utils/           # Utility functions
│   └── server.js        # Entry point
├── uploads/             # Uploaded files
├── .env                 # Environment variables
├── package.json         # Dependencies
└── README.md            # Documentation
```

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- MySQL (v5.7 or higher)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/reserve-backend.git
   cd reserve-backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file based on `env.example`:
   ```bash
   cp env.example .env
   ```

4. Update the `.env` file with your MySQL credentials and other configuration.

5. Create the MySQL database:
   ```sql
   CREATE DATABASE reservation_db;
   ```

6. Import the database schema:
   ```bash
   mysql -u your_username -p reservation_db < modals/schema
   ```

7. Start the server:
   ```bash
   npm run dev
   ```

## Socket.io Integration

The backend now includes Socket.io for real-time messaging and notifications. Here's how to use it in your frontend:

### Connecting to Socket.io

```javascript
import { io } from 'socket.io-client';

// Connect to the socket server with authentication
const socket = io('http://your-api-url', {
  auth: {
    token: 'your-jwt-token' // The same JWT token used for API authentication
  }
});

// Handle connection events
socket.on('connect', () => {
  console.log('Connected to socket server');
});

socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error.message);
});
```

### Messaging Features

```javascript
// Join a conversation with another user
function joinConversation(userId) {
  socket.emit('join_conversation', userId);
}

// Leave a conversation
function leaveConversation(userId) {
  socket.emit('leave_conversation', userId);
}

// Listen for new messages
socket.on('new_message', (message) => {
  console.log('New message received:', message);
  // Update your UI with the new message
});

// Listen for read receipts
socket.on('messages_read', (data) => {
  console.log('Messages read by:', data.readBy);
  // Update your UI to show messages as read
});
```

### Notifications

```javascript
// Listen for notifications
socket.on('notification', (notification) => {
  console.log('New notification:', notification);
  
  // Handle different notification types
  switch(notification.type) {
    case 'new_message':
      // Show message notification
      showMessageNotification(notification.data);
      break;
    // Handle other notification types
    default:
      console.log('Unknown notification type:', notification.type);
  }
});

// Example notification handler
function showMessageNotification(data) {
  // Show a browser notification or in-app notification
  if (Notification.permission === 'granted') {
    new Notification('New Message', {
      body: `You have a new message from ${data.senderId}`,
      icon: '/path/to/icon.png'
    });
  }
  
  // Update unread message count in UI
  updateUnreadCount();
}

// Function to get unread message count
async function updateUnreadCount() {
  const response = await fetch('/api/messages/unread-count', {
    headers: {
      'Authorization': `Bearer ${yourAuthToken}`
    }
  });
  const data = await response.json();
  // Update UI with unread count
  document.getElementById('unread-badge').textContent = data.data.unreadCount;
}
```

## API Endpoints

### Authentication
- `POST /api/users/register` - Register a new user
- `POST /api/users/login` - Login user

### Users
- `GET /api/users/profile` - Get current user profile
- `PUT /api/users/profile` - Update current user profile
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Categories
- `GET /api/categories` - Get all categories
- `GET /api/categories/:id` - Get category by ID
- `GET /api/categories/:id/listings` - Get listings by category
- `POST /api/categories` - Create a new category (Admin)
- `PUT /api/categories/:id` - Update a category (Admin)
- `DELETE /api/categories/:id` - Delete a category (Admin)

### Listings
- `GET /api/listings` - Get all listings
- `GET /api/listings/:id` - Get listing by ID
- `POST /api/listings` - Create a new listing (Provider)
- `PUT /api/listings/:id` - Update a listing (Owner)
- `DELETE /api/listings/:id` - Delete a listing (Owner)
- `POST /api/listings/:id/photos` - Add photos to a listing (Owner)
- `DELETE /api/listings/:id/photos/:photoId` - Delete a photo (Owner)
- `PUT /api/listings/:id/photos/:photoId/cover` - Set cover photo (Owner)
- `POST /api/listings/:id/check-availability` - Check availability
- `POST /api/listings/:id/availability` - Add availability (Owner)

### Bookings
- `GET /api/bookings` - Get all bookings for the user
- `GET /api/bookings/:id` - Get booking by ID
- `POST /api/bookings` - Create a new booking
- `PUT /api/bookings/:id` - Update a booking
- `POST /api/bookings/:id/cancel` - Cancel a booking
- `POST /api/bookings/:id/complete` - Complete a booking (Provider)
- `POST /api/bookings/:id/payment` - Process payment for a booking

## License

This project is licensed under the MIT License.

## Acknowledgements

- [Express](https://expressjs.com/)
- [MySQL](https://www.mysql.com/)
- [JWT](https://jwt.io/)
- [Bcrypt](https://github.com/kelektiv/node.bcrypt.js)
- [Multer](https://github.com/expressjs/multer) 