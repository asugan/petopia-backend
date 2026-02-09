import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/models/mongoose', () => ({
  EventModel: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
  RecurrenceRuleModel: {
    findOne: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
  UserSettingsModel: {
    findOne: vi.fn(),
  },
  PetModel: {
    findOne: vi.fn(),
  },
}));

import {
  EventModel,
  RecurrenceRuleModel,
  UserSettingsModel,
} from '../../../src/models/mongoose';
import { RecurrenceService } from '../../../src/services/recurrenceService';

describe('RecurrenceService timezone-local day calculations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-03T20:00:00.000Z'));

    vi.mocked(UserSettingsModel.findOne).mockReturnValue({
      exec: vi.fn().mockResolvedValue({ defaultEventTime: '09:00' }),
    } as any);

    vi.mocked(EventModel.findOne).mockReturnValue({
      exec: vi.fn().mockResolvedValue(null),
    } as any);

    vi.mocked(RecurrenceRuleModel.findByIdAndUpdate).mockResolvedValue(null as any);
  });

  it('uses rule.timezone local day-of-week for weekly generation', async () => {
    const service = new RecurrenceService();

    vi.mocked(RecurrenceRuleModel.findOne).mockReturnValue({
      exec: vi.fn().mockResolvedValue({
        _id: { toString: () => 'rule-1' },
        userId: { toString: () => '507f1f77bcf86cd799439011' },
        petId: { toString: () => '507f1f77bcf86cd799439012' },
        title: 'Weekly Feeding',
        type: 'feeding',
        reminder: false,
        reminderPreset: 'standard',
        frequency: 'weekly',
        interval: 1,
        daysOfWeek: [3],
        timezone: 'Europe/Istanbul',
        startDate: new Date('2026-02-03T21:00:00.000Z'),
        endDate: null,
        excludedDates: [],
        dailyTimes: ['09:00'],
        isActive: true,
      }),
    } as any);

    await service.generateEvents('507f1f77bcf86cd799439011', 'rule-1');

    expect(EventModel.create).toHaveBeenCalled();

    const firstCreateCall = vi.mocked(EventModel.create).mock.calls[0]?.[0] as {
      startTime: Date;
    };

    expect(firstCreateCall).toBeDefined();
    expect(firstCreateCall.startTime.toISOString()).toBe('2026-02-10T06:00:00.000Z');
  });
});
