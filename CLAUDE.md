# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PawPa Backend is a REST API server for a pet care mobile application. It's built with Express v5, TypeScript, MongoDB (Mongoose), and Better-Auth for authentication.

## Common Commands

```bash
# Development
npm run dev              # Start with hot reload (nodemon)
npm run build            # Build for production (tsup)
npm run start            # Start production server

# Database
npm run db:seed          # Seed test data
npm run db:clean         # Clear all data
npm run db:status        # Check connection
npm run db:generate-indexes  # Create MongoDB indexes

# Testing
npm run test             # Watch mode
npm run test:run         # Run once
npm run test:ui          # Visual interface
npm run test:coverage    # Coverage report

# Code Quality
npm run lint             # ESLint
npm run lint:fix         # Fix ESLint issues
npm run format           # Prettier formatting
npm run type-check       # TypeScript type check
```

## Architecture

The project follows a **controller-service pattern**:

- **Controllers** (`src/controllers/`): Handle HTTP requests, validate input, call services, format responses. Use `AuthenticatedRequest` and `requireAuth` middleware.
- **Services** (`src/services/`): Business logic layer. Interact with Mongoose models. Services are stateless - instantiate new instances in controllers.
- **Models** (`src/models/mongoose/`): Mongoose schemas with TypeScript interfaces. Each model exports both the Mongoose model and the TypeScript interface.
- **Routes** (`src/routes/`): Express route definitions that mount controllers.
- **Middleware** (`src/middleware/`): Auth, error handling, CORS, rate limiting, UTC date serialization.

### API Response Format

All endpoints return a consistent structure:
```typescript
{ success: boolean; data?: T; error?: { code, message, details? }; meta?: { total?, page?, limit?, totalPages? } }
```

Use `successResponse(res, data, statusCode, meta)` from `src/utils/response.ts`.

### Request Authentication

Protected endpoints use `requireAuth(req)` from `src/middleware/auth.ts` to get the authenticated user's ID:
```typescript
const userId = requireAuth(req);
```

### Date Handling

Use `parseUTCDate()` from `src/lib/dateUtils.ts` to convert string dates to UTC Date objects from client requests.

## Key Configuration

- **Auth**: `src/lib/auth.ts` - Better-Auth configuration with Google and Apple providers. Email/password is disabled.
- **MongoDB**: Two connections - one via Mongoose (`mongoose.connect`), one via native MongoDB driver for Better-Auth (`authMongoClient`).
- **CORS**: Configured for mobile apps including Expo development URLs and capacitor:// schemes.

## Adding New Features

1. Define schema in `src/models/mongoose/`
2. Create service in `src/services/` for business logic
3. Create controller in `src/controllers/` for request handling
4. Define routes in `src/routes/` and mount in `src/routes/index.ts`
5. Add Zod validation in `src/middleware/validation.ts` if needed
