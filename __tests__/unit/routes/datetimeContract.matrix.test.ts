import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const controllerSpies = vi.hoisted(() => ({
  eventCreate: vi.fn((req: express.Request, res: express.Response) => {
    res.status(201).json({ success: true });
  }),
  expenseCreate: vi.fn((req: express.Request, res: express.Response) => {
    res.status(201).json({ success: true });
  }),
  expenseList: vi.fn((req: express.Request, res: express.Response) => {
    res.status(200).json({ success: true, data: [] });
  }),
  healthCreate: vi.fn((req: express.Request, res: express.Response) => {
    res.status(201).json({ success: true });
  }),
  recurrenceCreate: vi.fn((req: express.Request, res: express.Response) => {
    res.status(201).json({ success: true });
  }),
  recurrenceException: vi.fn((req: express.Request, res: express.Response) => {
    res.status(200).json({ success: true });
  }),
}));

vi.mock('@/controllers/eventController', () => ({
  EventController: class {
    getUpcomingEvents = vi.fn();
    getTodayEvents = vi.fn();
    getEventsByDate = vi.fn();
    getEventsByPetId = vi.fn();
    getEventById = vi.fn();
    createEvent = controllerSpies.eventCreate;
    updateEvent = vi.fn();
    deleteEvent = vi.fn();
  },
}));

vi.mock('@/controllers/expenseController', () => ({
  ExpenseController: class {
    getExpensesByPetId = controllerSpies.expenseList;
    createExpense = controllerSpies.expenseCreate;
    getExpenseById = vi.fn();
    updateExpense = vi.fn();
    deleteExpense = vi.fn();
    getExpenseStats = vi.fn();
    getExpensesByDateRange = vi.fn();
    getMonthlyExpenses = vi.fn();
    getYearlyExpenses = vi.fn();
    getExpensesByCategory = vi.fn();
    exportExpensesCSV = vi.fn();
    exportExpensesPDF = vi.fn();
    exportVetSummaryPDF = vi.fn();
  },
}));

vi.mock('@/controllers/healthRecordController', () => ({
  HealthRecordController: class {
    getHealthRecordsByPetId = vi.fn();
    getAllHealthRecords = vi.fn();
    getHealthRecordById = vi.fn();
    createHealthRecord = controllerSpies.healthCreate;
    updateHealthRecord = vi.fn();
    deleteHealthRecord = vi.fn();
  },
}));

vi.mock('@/controllers/recurrenceController', () => ({
  RecurrenceController: class {
    getRules = vi.fn();
    getRuleById = vi.fn();
    getEventsByRuleId = vi.fn();
    createRule = controllerSpies.recurrenceCreate;
    updateRule = vi.fn();
    deleteRule = vi.fn();
    regenerateEvents = vi.fn();
    addException = controllerSpies.recurrenceException;
    generateAllEvents = vi.fn();
  },
}));

vi.mock('@/middleware/subscription', () => ({
  requireActiveSubscription: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

vi.mock('@/middleware/auth', () => ({
  requireInternalApiKey: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

vi.mock('@/utils/mongodb-validation', () => ({
  validateObjectId: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

import { errorHandler } from '@/middleware/errorHandler';
import eventRoutes from '@/routes/eventRoutes';
import expenseRoutes from '@/routes/expenseRoutes';
import healthRecordRoutes from '@/routes/healthRecordRoutes';
import recurrenceRoutes from '@/routes/recurrenceRoutes';

describe('datetime timezone contract matrix', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/events', eventRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/health-records', healthRecordRoutes);
  app.use('/api/recurrence-rules', recurrenceRoutes);
  app.use(errorHandler);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('event startTime accepts timezone-aware datetime and rejects naive datetime', async () => {
    const baseBody = {
      petId: '507f1f77bcf86cd799439012',
      title: 'Vaccine',
      type: 'vaccination',
    };

    const acceptedInputs = [
      '2026-02-09T10:30:00Z',
      '2026-02-09T10:30:00+03:00',
      '2026-02-09T10:30:00-05:00',
    ];

    for (const startTime of acceptedInputs) {
      const response = await request(app)
        .post('/api/events')
        .send({ ...baseBody, startTime });

      expect(response.status).toBe(201);
    }

    const rejected = await request(app)
      .post('/api/events')
      .send({ ...baseBody, startTime: '2026-02-09T10:30:00' });

    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe('VALIDATION_ERROR');
    expect(controllerSpies.eventCreate).toHaveBeenCalledTimes(acceptedInputs.length);
  });

  it('health record date accepts timezone-aware datetime and rejects naive datetime', async () => {
    const baseBody = {
      petId: '507f1f77bcf86cd799439012',
      type: 'checkup',
      title: 'Routine visit',
    };

    const accepted = await request(app)
      .post('/api/health-records')
      .send({ ...baseBody, date: '2026-02-09T10:30:00+03:00' });

    expect(accepted.status).toBe(201);

    const rejected = await request(app)
      .post('/api/health-records')
      .send({ ...baseBody, date: '2026-02-09T10:30:00' });

    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe('VALIDATION_ERROR');
    expect(controllerSpies.healthCreate).toHaveBeenCalledTimes(1);
  });

  it('expense endpoints keep LocalDate support but reject naive datetime', async () => {
    const createAccepted = await request(app)
      .post('/api/expenses')
      .send({
        petId: '507f1f77bcf86cd799439012',
        category: 'food',
        amount: 100,
        date: '2026-02-09',
      });

    expect(createAccepted.status).toBe(201);

    const listAcceptedLocalDate = await request(app).get(
      '/api/expenses?startDate=2026-02-01&endDate=2026-02-29'
    );
    expect(listAcceptedLocalDate.status).toBe(200);

    const listAcceptedOffset = await request(app).get(
      '/api/expenses?startDate=2026-02-01T00:00:00%2B03:00&endDate=2026-02-29T23:59:59%2B03:00'
    );
    expect(listAcceptedOffset.status).toBe(200);

    const listRejectedNaive = await request(app).get(
      '/api/expenses?startDate=2026-02-01T00:00:00&endDate=2026-02-29'
    );
    expect(listRejectedNaive.status).toBe(400);
    expect(listRejectedNaive.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('recurrence startDate and exceptions require timezone-aware datetime; endDate allows LocalDate', async () => {
    const createAccepted = await request(app)
      .post('/api/recurrence-rules')
      .send({
        petId: '507f1f77bcf86cd799439012',
        title: 'Medication Plan',
        type: 'medication',
        frequency: 'daily',
        timezone: 'Europe/Istanbul',
        startDate: '2026-02-09T10:30:00Z',
        endDate: '2026-02-12',
      });

    expect(createAccepted.status).toBe(201);

    const createRejectedNaive = await request(app)
      .post('/api/recurrence-rules')
      .send({
        petId: '507f1f77bcf86cd799439012',
        title: 'Medication Plan',
        type: 'medication',
        frequency: 'daily',
        timezone: 'Europe/Istanbul',
        startDate: '2026-02-09T10:30:00',
      });

    expect(createRejectedNaive.status).toBe(400);
    expect(createRejectedNaive.body.error.code).toBe('VALIDATION_ERROR');

    const exceptionAccepted = await request(app)
      .post('/api/recurrence-rules/507f1f77bcf86cd799439012/exceptions')
      .send({ date: '2026-02-10T08:00:00+03:00' });

    expect(exceptionAccepted.status).toBe(200);

    const exceptionRejected = await request(app)
      .post('/api/recurrence-rules/507f1f77bcf86cd799439012/exceptions')
      .send({ date: '2026-02-10T08:00:00' });

    expect(exceptionRejected.status).toBe(400);
    expect(exceptionRejected.body.error.code).toBe('VALIDATION_ERROR');
  });
});
