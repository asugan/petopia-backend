import express, { Request, Response } from 'express';
import helmet from 'helmet';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './lib/auth';
import { corsMiddleware } from './middleware/cors';
import { requestLogger } from './middleware/requestLogger';
import { rateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import { utcDateSerializer } from './middleware/utcDateSerializer';
import apiRoutes from './routes';
import { initializeScheduler } from './jobs/scheduler.js';

const app = express();

const trustProxySetting = process.env.TRUST_PROXY;
if (trustProxySetting !== undefined) {
  const normalized = trustProxySetting.trim().toLowerCase();
  if (normalized === 'true') {
    app.set('trust proxy', true);
  } else if (normalized === 'false') {
    app.set('trust proxy', false);
  } else if (normalized !== '' && !Number.isNaN(Number(normalized))) {
    app.set('trust proxy', Number(normalized));
  } else {
    app.set('trust proxy', trustProxySetting);
  }
} else if (process.env.NODE_ENV === 'production') {
  // Default to trusting the first proxy in production deployments.
  app.set('trust proxy', 1);
}

// Security middleware
app.use(helmet());

// CORS middleware
app.use(corsMiddleware);

// Rate limiting
app.use(rateLimiter);

// Better Auth handler - MUST come before express.json()
// Express v5 requires named wildcard: *splat instead of just *
const authBasePath = process.env.BETTER_AUTH_BASEPATH ?? '/auth';
app.all(`${authBasePath}/*splat`, toNodeHandler(auth));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(requestLogger);

// UTC date serialization middleware
app.use(utcDateSerializer);

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: 'OK',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '1.0.0',
      environment: process.env.NODE_ENV ?? 'development',
    },
  });
});

const apiInfoResponse = {
  success: true,
  data: {
    message: 'Petopia Backend API is running',
    version: 'v1.1.0',
    endpoints: {
      public: {
        health: '/health',
        publicConfig: '/api/public-config',
        subscriptionWebhook: '/api/subscription/webhook',
      },
      auth: {
        auth: `${authBasePath}/*`,
      },
      account: {
        account: '/api/account',
        settings: '/api/settings',
        subscription: {
          status: '/api/subscription/status',
          trialStatus: '/api/subscription/trial-status',
          startTrial: '/api/subscription/start-trial',
          deactivateTrial: '/api/subscription/deactivate-trial',
        },
      },
      protected: {
        pets: '/api/pets',
        petsById: '/api/pets/:id',
        petPhoto: '/api/pets/:id/photo',
        petHealthRecords: '/api/pets/:id/health-records',
        healthRecords: '/api/health-records',
        healthRecordById: '/api/health-records/:id',
        events: '/api/events',
        eventById: '/api/events/:id',
        eventUpcoming: '/api/events/upcoming',
        eventToday: '/api/events/today',
        eventCalendar: '/api/events/calendar/:date',
        feedingSchedules: '/api/feeding-schedules',
        feedingScheduleById: '/api/feeding-schedules/:id',
        feedingSchedulesActive: '/api/feeding-schedules/active',
        feedingSchedulesToday: '/api/feeding-schedules/today',
        feedingSchedulesNext: '/api/feeding-schedules/next',
        expenses: '/api/expenses',
        expenseById: '/api/expenses/:id',
        expenseStats: '/api/expenses/stats',
        expenseByDate: '/api/expenses/by-date',
        expenseMonthly: '/api/expenses/monthly',
        expenseYearly: '/api/expenses/yearly',
        expenseByCategory: '/api/expenses/by-category/:category',
        expenseExportCsv: '/api/expenses/export/csv',
        expenseExportPdf: '/api/expenses/export/pdf',
        expenseExportVetSummary: '/api/expenses/export/vet-summary',
        budget: '/api/budget',
        budgetStatus: '/api/budget/status',
        budgetAlerts: '/api/budget/alerts',
      },
      nested: {
        petHealthRecords: '/api/pets/:petId/health-records',
        petEvents: '/api/pets/:petId/events',
        petFeedingSchedules: '/api/pets/:petId/feeding-schedules',
        petExpenses: '/api/pets/:petId/expenses',
      },
    },
  },
};

// API info endpoint
app.get('/api', (_req: Request, res: Response) => {
  res.json(apiInfoResponse);
});

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json(apiInfoResponse);
});

// Mount API routes after the info endpoint
app.use('/api', apiRoutes);

// Initialize job scheduler (runs in background, doesn't block server)
if (process.env.NODE_ENV !== 'test') {
  initializeScheduler();
}

// Error handling middleware (should be last)
app.use(errorHandler);

export default app;
