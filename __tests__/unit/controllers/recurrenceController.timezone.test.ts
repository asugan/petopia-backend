import type { NextFunction, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/recurrenceService', () => ({
  RecurrenceService: class {
    createRule = vi.fn();
    addException = vi.fn();
  },
}));

vi.mock('@/middleware/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/dateUtils', () => ({
  parseUTCDate: vi.fn((value: string) => {
    if (value === 'invalid') {
      throw new Error('invalid date');
    }
    return new Date(value);
  }),
}));

import { RecurrenceController } from '@/controllers/recurrenceController';
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

describe('RecurrenceController timezone runtime guards', () => {
  let controller: RecurrenceController;
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new RecurrenceController();
    next = vi.fn() as NextFunction;
    vi.mocked(requireAuth).mockReturnValue('507f1f77bcf86cd799439011');
  });

  it('rejects invalid timezone in create payload', async () => {
    const req = mockRequest({
      body: {
        petId: '507f1f77bcf86cd799439012',
        title: 'Weekly Check',
        type: 'feeding',
        frequency: 'weekly',
        startDate: '2026-02-04T00:00:00.000Z',
        timezone: 'Invalid/Timezone',
      },
    });

    await controller.createRule(req, mockResponse(), next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_TIMEZONE', statusCode: 400 })
    );
  });

  it('parses exception date via parseUTCDate before service call', async () => {
    (controller as any).recurrenceService.addException = vi.fn().mockResolvedValue(true);

    const req = mockRequest({
      params: { id: '507f1f77bcf86cd799439013' },
      body: { date: '2026-02-04T10:00:00.000Z' },
    });

    await controller.addException(req, mockResponse(), next);

    expect(parseUTCDate).toHaveBeenCalledWith('2026-02-04T10:00:00.000Z');
    expect((controller as any).recurrenceService.addException).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      '507f1f77bcf86cd799439013',
      new Date('2026-02-04T10:00:00.000Z')
    );
  });
});
