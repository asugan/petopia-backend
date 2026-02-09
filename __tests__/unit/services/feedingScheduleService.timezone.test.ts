import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/models/mongoose', () => ({
  FeedingScheduleModel: {
    find: vi.fn(),
    findOne: vi.fn(),
  },
  PetModel: {
    findOne: vi.fn(),
  },
  UserSettingsModel: {
    findOne: vi.fn(),
  },
}));

vi.mock('date-fns-tz', () => ({
  formatInTimeZone: vi.fn(),
}));

import { formatInTimeZone } from 'date-fns-tz';
import { FeedingScheduleModel, UserSettingsModel } from '../../../src/models/mongoose';
import { FeedingScheduleService } from '../../../src/services/feedingScheduleService';

describe('FeedingScheduleService timezone day resolution', () => {
  const userId = '507f1f77bcf86cd799439011';
  let service: FeedingScheduleService;

  beforeEach(() => {
    service = new FeedingScheduleService();
    vi.clearAllMocks();

    vi.mocked(UserSettingsModel.findOne).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue({ timezone: 'Europe/Istanbul' }),
    } as any);

    vi.mocked(formatInTimeZone).mockReturnValue('1'); // Monday (ISO day)

    vi.mocked(FeedingScheduleModel.find).mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    } as any);

    vi.mocked(FeedingScheduleModel.findOne).mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(null),
    } as any);
  });

  it('uses user timezone day for getTodaySchedules', async () => {
    await service.getTodaySchedules(userId);

    const query = vi.mocked(FeedingScheduleModel.find).mock.calls[0]?.[0] as any;
    expect(query.$or[0].days.$in).toEqual(['monday']);
    expect(query.$or[1].days.$regex).toBe('monday');
    expect(query.$or[1].days.$options).toBe('i');
  });

  it('uses user timezone day for getNextFeedingTime', async () => {
    await service.getNextFeedingTime(userId);

    const query = vi.mocked(FeedingScheduleModel.findOne).mock.calls[0]?.[0] as any;
    expect(query.$or[0].days.$in).toEqual(['monday']);
    expect(query.$or[1].days.$regex).toBe('monday');
    expect(query.$or[1].days.$options).toBe('i');
  });

  it('falls back to UTC when timezone is missing', async () => {
    vi.mocked(UserSettingsModel.findOne).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(null),
    } as any);

    await service.getTodaySchedules(userId);

    expect(formatInTimeZone).toHaveBeenCalledWith(expect.any(Date), 'UTC', 'i');
  });
});
