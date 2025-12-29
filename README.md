# PawPa Backend API

PawPa pet care mobile application backend server built with Node.js, Express, TypeScript, and
MongoDB.

## Features

- **Express.js v5** REST API server
- **TypeScript** for type safety
- **MongoDB** database with **Mongoose** ODM
- **Better-Auth** authentication with social providers (Google, Apple, Facebook)
- **Mobile-first** design with Expo/React Native support
- **Security middleware** (Helmet, CORS, Rate Limiting)
- **Request validation** with Zod
- **Error handling** and logging with Morgan
- **Health check** endpoints
- **PDF export** functionality for reports
- **Unit & Integration Testing** with Vitest and Supertest

## Quick Start

### Prerequisites

- Node.js (v20.19 or higher)
- MongoDB (local or cloud instance)
- npm or yarn

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd petopia-backend
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
cp .env.example .env
# Edit .env with your configuration
```

Required environment variables:

- `MONGODB_URI` - MongoDB connection string
- `BETTER_AUTH_SECRET` - Secret key for authentication
- `BETTER_AUTH_URL` - Base URL for auth redirects
- `GOOGLE_CLIENT_ID` - Google OAuth client ID (optional)
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret (optional)
- `APPLE_CLIENT_ID` - Apple Sign In client ID (optional)
- `APPLE_CLIENT_SECRET` - Apple Sign In client secret (optional)
- `FACEBOOK_CLIENT_ID` - Facebook App ID (optional)
- `FACEBOOK_CLIENT_SECRET` - Facebook App Secret (optional)

4. Set up the database (optional - seed with test data):

```bash
npm run db:seed
```

5. Start the development server:

```bash
npm run dev
```

The server will start on `http://localhost:3000`

## Available Scripts

- `npm run dev` - Start development server with hot reload (nodemon)
- `npm run build` - Build for production (tsup)
- `npm run start` - Start production server
- `npm run db:seed` - Seed database with test data
- `npm run db:clean` - Clean all data from database
- `npm run db:status` - Check database connection status
- `npm run db:generate-indexes` - Generate MongoDB indexes
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run format` - Format code with Prettier
- `npm run type-check` - Run TypeScript type check
- `npm test` - Run tests in watch mode
- `npm run test:ui` - Run tests with visual interface
- `npm run test:run` - Run tests once
- `npm run test:coverage` - Generate code coverage report

## API Endpoints

### Health Check

- `GET /health` - Server health status
- `GET /api` - API information and available endpoints

### Authentication (Better-Auth)

All endpoints under `/api/auth/*` are handled by Better-Auth:

- Google Sign In
- Apple Sign In
- Facebook Login
- Session management

### Pets

- `GET /api/pets` - List all pets (authenticated)
- `GET /api/pets/:id` - Get pet details (authenticated)
- `POST /api/pets` - Create new pet (authenticated)
- `PUT /api/pets/:id` - Update pet (authenticated)
- `DELETE /api/pets/:id` - Delete pet (authenticated, cascades to related records)

### Health Records

- `GET /api/health-records` - List all health records (authenticated)
- `GET /api/health-records/:id` - Get health record details (authenticated)
- `GET /api/pets/:petId/health-records` - Get pet health records (authenticated)
- `POST /api/health-records` - Create health record (authenticated)
- `PUT /api/health-records/:id` - Update health record (authenticated)
- `DELETE /api/health-records/:id` - Delete health record (authenticated)

### Events

- `GET /api/events` - List all events (authenticated)
- `GET /api/events/:id` - Get event details (authenticated)
- `GET /api/pets/:petId/events` - Get pet events (authenticated)
- `POST /api/events` - Create event (authenticated)
- `PUT /api/events/:id` - Update event (authenticated)
- `DELETE /api/events/:id` - Delete event (authenticated)

### Feeding Schedules

- `GET /api/feeding-schedules` - List all feeding schedules (authenticated)
- `GET /api/feeding-schedules/:id` - Get feeding schedule details (authenticated)
- `GET /api/pets/:petId/feeding-schedules` - Get pet feeding schedules (authenticated)
- `POST /api/feeding-schedules` - Create feeding schedule (authenticated)
- `PUT /api/feeding-schedules/:id` - Update feeding schedule (authenticated)
- `DELETE /api/feeding-schedules/:id` - Delete feeding schedule (authenticated)

### Expenses

- `GET /api/expenses` - List all expenses (authenticated)
- `GET /api/expenses/:id` - Get expense details (authenticated)
- `GET /api/pets/:petId/expenses` - Get pet expenses (authenticated)
- `POST /api/expenses` - Create expense (authenticated)
- `PUT /api/expenses/:id` - Update expense (authenticated)
- `DELETE /api/expenses/:id` - Delete expense (authenticated)
- `GET /api/expenses/export/pdf` - Export expenses as PDF (authenticated)

### Budget

- `GET /api/budget/user` - Get user budget (authenticated)
- `GET /api/budget/user/status` - Get current budget status with spending breakdown (authenticated)
- `PUT /api/budget/user` - Set/update user budget (authenticated)
- `DELETE /api/budget/user` - Delete user budget (authenticated)

### Subscription

- `POST /api/subscription/webhook` - Webhook endpoint for payment provider (no auth required)
- Subscription status and premium feature access (authenticated)

### Webhooks

- `POST /api/subscription/webhook` - Payment provider webhook (requires HMAC verification)

## Project Structure

```
src/
├── controllers/          # API route handlers (pet, health, event, expense, subscription...)
├── services/             # Business logic layer
├── routes/               # Route definitions
├── models/               # Mongoose schema definitions
│   └── mongoose/         # MongoDB/Mongoose models (Pet, HealthRecord, Event, Expense...)
├── middleware/           # Custom middleware (auth, error handling, rate limiting, logging)
├── lib/                  # Better-Auth configuration
├── config/               # Subscription configuration
├── types/                # TypeScript type definitions
├── utils/                # Helper functions (ID validation, response formatting)
├── app.ts                # Express app configuration
└── index.ts              # Server entry point
__tests__/                # Test files
├── helpers/              # Test utilities
├── unit/                 # Unit tests
└── integration/          # Integration tests
scripts/                  # Database utility scripts (seed, clean, status, indexes)
```

## Environment Variables

| Variable                 | Description                          | Required |
| ------------------------ | ------------------------------------ | -------- |
| `NODE_ENV`               | Environment (development/production) | No       |
| `PORT`                   | Server port (default: 3000)          | No       |
| `MONGODB_URI`            | MongoDB connection string            | Yes      |
| `BETTER_AUTH_SECRET`     | Secret key for authentication        | Yes      |
| `BETTER_AUTH_URL`        | Base URL for auth redirects          | Yes      |
| `GOOGLE_CLIENT_ID`       | Google OAuth client ID               | No\*     |
| `GOOGLE_CLIENT_SECRET`   | Google OAuth client secret           | No\*     |
| `APPLE_CLIENT_ID`        | Apple Sign In client ID              | No\*     |
| `APPLE_CLIENT_SECRET`    | Apple Sign In client secret          | No\*     |
| `FACEBOOK_CLIENT_ID`     | Facebook App ID                      | No\*     |
| `FACEBOOK_CLIENT_SECRET` | Facebook App Secret                  | No\*     |

\*Required for social login features

## Testing

The project uses **Vitest** as the test runner and **Supertest** for API endpoint testing.

### Test Structure

```
__tests__/
├── helpers/              # Test utilities (testApp, mongodb setup, mock auth)
├── unit/                 # Unit tests (services, utils, middleware)
└── integration/          # Integration tests (routes, models)
```

### Test Helpers

- `createTestClient()` - Supertest client for API testing
- `setupTestDB()` - MongoDB test database setup with auto-cleanup
- `mockAuth()` - Mock authentication for protected endpoints

### Running Tests

```bash
# Watch mode (re-runs on file changes)
npm test

# Visual interface
npm run test:ui

# Run once
npm run test:run

# Coverage report
npm run test:coverage
```

### Test Environment

Set `MONGODB_TEST_URI` environment variable for test database (defaults to `MONGODB_URI` if not
set).

```bash
# .env.test
MONGODB_TEST_URI=mongodb://localhost:27017/test
```

## Database Schema

The application uses MongoDB with Mongoose ODM with the following main collections:

- **users** - User accounts (managed by Better-Auth)
- **pets** - Pet information (with cascade delete support)
- **health_records** - Health and medical records
- **events** - Scheduled events, activities, vaccinations (includes vaccine/medication data)
- **feeding_schedules** - Recurring feeding schedules
- **expenses** - Expense tracking with multi-currency support
- **user_budgets** - User budget limits and alerts
- **subscriptions** - Subscription status and trial tracking
- **device_trial_registries** - Device-level trial tracking
- **user_trial_registries** - User-level trial tracking

## Error Handling

All API responses follow a consistent format:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  };
}
```

## Development

### Database Management

```bash
# Seed database with test data
npm run db:seed

# Clean all data from database
npm run db:clean

# Check database connection status
npm run db:status

# Generate MongoDB indexes
npm run db:generate-indexes
```

### Authentication

Authentication is handled by **Better-Auth** with the following features:

- Social providers (Google, Apple, Facebook)
- Session-based authentication (7-day expiration)
- Mobile app support via Expo plugin
- Rate limiting stored in MongoDB

### Middleware Stack

1. **Helmet** - Security headers
2. **CORS** - Cross-origin resource sharing (configured for mobile apps)
3. **Rate Limiter** - Request rate limiting
4. **Better-Auth Handler** - Authentication endpoints
5. **Express JSON/URL Parser** - Body parsing (10MB limit)
6. **Request Logger** - Morgan logging (skips /health in production)
7. **UTC Date Serializer** - Date serialization middleware
8. **Routes** - API routes with auth middleware
9. **Error Handler** - Centralized error handling

### Adding New Endpoints

1. Define schemas in `src/models/mongoose/`
2. Create controllers in `src/controllers/`
3. Define routes in `src/routes/`
4. Add middleware as needed in `src/middleware/`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

ISC License
