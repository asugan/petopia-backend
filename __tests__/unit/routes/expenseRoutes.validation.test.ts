import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const controllerSpies = vi.hoisted(() => ({
  getExpensesByPetId: vi.fn((req: express.Request, res: express.Response) => {
    res.status(200).json({ success: true, data: [] });
  }),
  createExpense: vi.fn((req: express.Request, res: express.Response) => {
    res.status(201).json({ success: true, data: { id: 'exp-1' } });
  }),
  getExpenseById: vi.fn((req: express.Request, res: express.Response) => {
    res.status(200).json({ success: true });
  }),
  updateExpense: vi.fn((req: express.Request, res: express.Response) => {
    res.status(200).json({ success: true });
  }),
  deleteExpense: vi.fn((req: express.Request, res: express.Response) => {
    res.status(200).json({ success: true });
  }),
  getExpenseStats: vi.fn((req: express.Request, res: express.Response) => {
    res.status(200).json({ success: true });
  }),
  getExpensesByDateRange: vi.fn((req: express.Request, res: express.Response) => {
    res.status(200).json({ success: true });
  }),
  getMonthlyExpenses: vi.fn((req: express.Request, res: express.Response) => {
    res.status(200).json({ success: true });
  }),
  getYearlyExpenses: vi.fn((req: express.Request, res: express.Response) => {
    res.status(200).json({ success: true });
  }),
  getExpensesByCategory: vi.fn((req: express.Request, res: express.Response) => {
    res.status(200).json({ success: true });
  }),
  exportExpensesCSV: vi.fn((req: express.Request, res: express.Response) => {
    res.status(200).send('ok');
  }),
  exportExpensesPDF: vi.fn((req: express.Request, res: express.Response) => {
    res.status(200).send('ok');
  }),
  exportVetSummaryPDF: vi.fn((req: express.Request, res: express.Response) => {
    res.status(200).send('ok');
  }),
}));

vi.mock('@/controllers/expenseController', () => ({
  ExpenseController: class {
    getExpensesByPetId = controllerSpies.getExpensesByPetId;
    createExpense = controllerSpies.createExpense;
    getExpenseById = controllerSpies.getExpenseById;
    updateExpense = controllerSpies.updateExpense;
    deleteExpense = controllerSpies.deleteExpense;
    getExpenseStats = controllerSpies.getExpenseStats;
    getExpensesByDateRange = controllerSpies.getExpensesByDateRange;
    getMonthlyExpenses = controllerSpies.getMonthlyExpenses;
    getYearlyExpenses = controllerSpies.getYearlyExpenses;
    getExpensesByCategory = controllerSpies.getExpensesByCategory;
    exportExpensesCSV = controllerSpies.exportExpensesCSV;
    exportExpensesPDF = controllerSpies.exportExpensesPDF;
    exportVetSummaryPDF = controllerSpies.exportVetSummaryPDF;
  },
}));

vi.mock('@/middleware/subscription', () => ({
  requireActiveSubscription: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

vi.mock('@/utils/mongodb-validation', () => ({
  validateObjectId: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

import expenseRoutes from '@/routes/expenseRoutes';
import { errorHandler } from '@/middleware/errorHandler';

describe('expenseRoutes date validation', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/expenses', expenseRoutes);
  app.use(errorHandler);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects create payload datetime without timezone offset', async () => {
    const response = await request(app)
      .post('/api/expenses')
      .send({
        petId: '507f1f77bcf86cd799439012',
        category: 'food',
        amount: 100,
        date: '2026-02-04T10:00:00',
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(controllerSpies.createExpense).not.toHaveBeenCalled();
  });

  it('accepts create payload datetime with timezone offset', async () => {
    const response = await request(app)
      .post('/api/expenses')
      .send({
        petId: '507f1f77bcf86cd799439012',
        category: 'food',
        amount: 100,
        date: '2026-02-04T10:00:00+03:00',
      });

    expect(response.status).toBe(201);
    expect(controllerSpies.createExpense).toHaveBeenCalledTimes(1);
  });

  it('rejects list query startDate datetime without timezone offset', async () => {
    const response = await request(app).get(
      '/api/expenses?startDate=2026-02-04T10:00:00'
    );

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(controllerSpies.getExpensesByPetId).not.toHaveBeenCalled();
  });

  it('accepts list query startDate as LocalDate', async () => {
    const response = await request(app).get('/api/expenses?startDate=2026-02-04');

    expect(response.status).toBe(200);
    expect(controllerSpies.getExpensesByPetId).toHaveBeenCalledTimes(1);
  });
});
