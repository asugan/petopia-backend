import type { NextFunction, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/expenseService', () => ({
  ExpenseService: class {
    getExpenseStats = vi.fn();
    getExpensesByPetId = vi.fn();
    createExpense = vi.fn();
    updateExpense = vi.fn();
  },
}));

vi.mock('@/services/reportService', () => ({
  ReportService: class {},
}));

vi.mock('@/middleware/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/dateUtils', () => ({
  parseUTCDate: vi.fn((v: string) => {
    if (v === 'invalid') {
      throw new Error('invalid date');
    }
    return new Date(v);
  }),
}));

import { ExpenseController } from '@/controllers/expenseController';
import { requireAuth } from '@/middleware/auth';
import { parseUTCDate } from '@/lib/dateUtils';

const mockRequest = (overrides: Partial<Record<string, unknown>> = {}) =>
  ({
    params: {},
    query: {},
    body: {},
    ...overrides,
  }) as any;

const mockResponse = () => {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as Response;
};

describe('ExpenseController timezone/date query flow', () => {
  let controller: ExpenseController;
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new ExpenseController();
    next = vi.fn() as NextFunction;
    vi.mocked(requireAuth).mockReturnValue('507f1f77bcf86cd799439011');
  });

  it('uses validatedQuery and parseUTCDate for stats date filters', async () => {
    (controller as any).expenseService.getExpenseStats = vi.fn().mockResolvedValue({});

    const req = mockRequest({
      validatedQuery: {
        startDate: '2026-02-01T00:00:00.000Z',
        endDate: '2026-02-29T23:59:59.999Z',
      },
      query: {
        startDate: 'should-not-be-used',
      },
    });

    await controller.getExpenseStats(req, mockResponse(), next);

    expect(parseUTCDate).toHaveBeenCalledWith('2026-02-01T00:00:00.000Z');
    expect(parseUTCDate).toHaveBeenCalledWith('2026-02-29T23:59:59.999Z');
    expect((controller as any).expenseService.getExpenseStats).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      undefined,
      new Date('2026-02-01T00:00:00.000Z'),
      new Date('2026-02-29T23:59:59.999Z'),
      undefined
    );
  });

  it('returns error via next() when query date is invalid', async () => {
    const req = mockRequest({
      validatedQuery: {
        startDate: 'invalid',
      },
    });

    await controller.getExpenseStats(req, mockResponse(), next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_DATE_QUERY' }));
  });

  it('parses list range filters with parseUTCDate before service call', async () => {
    (controller as any).expenseService.getExpensesByPetId = vi
      .fn()
      .mockResolvedValue({ expenses: [], total: 0 });

    const req = mockRequest({
      validatedQuery: {
        startDate: '2026-02-01T00:00:00.000Z',
        endDate: '2026-02-29T23:59:59.999Z',
        page: 1,
        limit: 10,
      },
      query: {},
      params: {},
    });

    await controller.getExpensesByPetId(req, mockResponse(), next);

    expect((controller as any).expenseService.getExpensesByPetId).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      '',
      expect.objectContaining({
        startDate: new Date('2026-02-01T00:00:00.000Z'),
        endDate: new Date('2026-02-29T23:59:59.999Z'),
      })
    );
  });

  it('returns INVALID_DATE_BODY when create payload date is invalid', async () => {
    const req = mockRequest({
      body: {
        petId: '507f1f77bcf86cd799439012',
        category: 'food',
        amount: 100,
        date: 'invalid',
      },
    });

    await controller.createExpense(req, mockResponse(), next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_DATE_BODY' }));
  });
});
