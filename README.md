# Reservation Backend

This is the backend API for the reservation system.

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and update the values
4. Start the server: `npm start`

## Database Migrations

The system includes an automatic database migration system that runs migrations on application startup. Migrations are SQL files stored in the `utils/migrations` directory.

### How Migrations Work

1. When the server starts, it automatically runs any pending migrations
2. Migrations are tracked in a `migrations` table in the database
3. Only migrations that haven't been run before will be executed
4. When creating or updating listings, required migrations (like pricing details) are automatically ensured

### Creating New Migrations

To create a new migration:

1. Create a new SQL file in the `utils/migrations` directory with a descriptive name (e.g., `add_new_column.sql`)
2. Write your SQL statements in the file, separating multiple statements with semicolons
3. The migration will be automatically run on the next server startup

### Running Migrations Manually

If you need to run migrations manually:

```javascript
// Run all pending migrations
const migrationService = require('./utils/migrations/migrationService');
await migrationService.runPendingMigrations();

// Run a specific migration
await migrationService.runMigration('migration_file_name.sql');
```

## API Documentation

### Endpoints

#### Authentication
- `POST /api/users/register` - Register a new user
- `POST /api/users/login` - Login a user
- `GET /api/users/me` - Get current user

#### Listings
- `GET /api/listings` - Get all listings
- `GET /api/listings/:id` - Get listing by ID
- `POST /api/listings` - Create a new listing
- `PUT /api/listings/:id` - Update a listing
- `DELETE /api/listings/:id` - Delete a listing

#### Bookings
- `GET /api/bookings` - Get all bookings
- `GET /api/bookings/:id` - Get booking by ID
- `POST /api/bookings` - Create a new booking
- `PUT /api/bookings/:id` - Update a booking
- `DELETE /api/bookings/:id` - Cancel a booking

#### Categories
- `GET /api/categories` - Get all categories
- `GET /api/categories/:id` - Get category by ID
- `POST /api/categories` - Create a new category
- `PUT /api/categories/:id` - Update a category
- `DELETE /api/categories/:id` - Delete a category

#### Messages
- `GET /api/messages` - Get all messages
- `GET /api/messages/:id` - Get message by ID
- `POST /api/messages` - Create a new message
- `PUT /api/messages/:id` - Update a message
- `DELETE /api/messages/:id` - Delete a message

## Error Handling

The API uses standard HTTP status codes:

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Server Error

Error responses have the following format:

```json
{
  "status": "error",
  "statusCode": 400,
  "message": "Error message"
}
```

## Authentication

The API uses JWT for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <token>
```

## File Uploads

The API supports file uploads for listing photos. Use multipart/form-data to upload files.

## WebSockets

The API includes WebSocket support for real-time messaging.

## Environment Variables

See `.env.example` for required environment variables.