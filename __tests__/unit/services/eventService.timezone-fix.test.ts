import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventService } from '@/services/eventService';
import { UserSettingsModel, EventModel } from '@/models/mongoose';
import { Types } from 'mongoose';

// Mock the models
vi.mock('@/models/mongoose', () => ({
  UserSettingsModel: {
    findOne: vi.fn(),
  },
  EventModel: {
    find: vi.fn(),
    countDocuments: vi.fn(),
  },
  PetModel: {
    findOne: vi.fn(),
  },
}));

describe('EventService - Timezone Empty String Fix', () => {
  let eventService: EventService;
  const mockUserId = new Types.ObjectId().toString();

  beforeEach(() => {
    eventService = new EventService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Empty string timezone should fallback to user settings', () => {
    it('should use user settings timezone when clientTimezone is empty string', async () => {
      // Setup: User has Europe/Istanbul in settings
      (UserSettingsModel.findOne as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue({ timezone: 'Europe/Istanbul' }),
      });

      (EventModel.find as any).mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      });

      (EventModel.countDocuments as any).mockResolvedValue(0);

      // Call with empty string (simulating frontend not sending timezone)
      await eventService.getEventsByDate(
        mockUserId,
        '2026-02-04',
        {},
        ''  // Empty string - this was the bug!
      );

      // Get the query that was used
      const queryCall = (EventModel.find as any).mock.calls[0];
      const query = queryCall[0];

      console.log('\n=== Empty String Timezone Fix Test ===');
      console.log('Client timezone provided:', JSON.stringify(''));
      console.log('User settings timezone:', 'Europe/Istanbul');
      console.log('Query $gte:', query.startTime.$gte.toISOString());
      console.log('Query $lt:', query.startTime.$lt.toISOString());

      // Should use Istanbul timezone (UTC+3)
      // 4 Feb Istanbul: 2026-02-03T21:00:00Z - 2026-02-04T21:00:00Z
      expect(query.startTime.$gte.toISOString()).toBe('2026-02-03T21:00:00.000Z');
      expect(query.startTime.$lt.toISOString()).toBe('2026-02-04T21:00:00.000Z');
    });

    it('should use UTC when both clientTimezone and user settings are empty', async () => {
      // Setup: User has no timezone in settings
      (UserSettingsModel.findOne as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(null),  // No settings
      });

      (EventModel.find as any).mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      });

      (EventModel.countDocuments as any).mockResolvedValue(0);

      // Call with empty string
      await eventService.getEventsByDate(
        mockUserId,
        '2026-02-04',
        {},
        ''  // Empty string
      );

      const queryCall = (EventModel.find as any).mock.calls[0];
      const query = queryCall[0];

      console.log('\n=== Both Empty Fallback to UTC Test ===');
      console.log('Client timezone:', JSON.stringify(''));
      console.log('User settings:', null);
      console.log('Query $gte:', query.startTime.$gte.toISOString());
      console.log('Query $lt:', query.startTime.$lt.toISOString());

      // Should fallback to UTC
      expect(query.startTime.$gte.toISOString()).toBe('2026-02-04T00:00:00.000Z');
      expect(query.startTime.$lt.toISOString()).toBe('2026-02-05T00:00:00.000Z');
    });

    it('should use clientTimezone when provided (normal case)', async () => {
      // Setup: User has different timezone in settings
      (UserSettingsModel.findOne as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue({ timezone: 'America/New_York' }),
      });

      (EventModel.find as any).mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      });

      (EventModel.countDocuments as any).mockResolvedValue(0);

      // Call with client timezone (should override user settings)
      await eventService.getEventsByDate(
        mockUserId,
        '2026-02-04',
        {},
        'Europe/Istanbul'  // Client provides Istanbul
      );

      const queryCall = (EventModel.find as any).mock.calls[0];
      const query = queryCall[0];

      console.log('\n=== Client Timezone Priority Test ===');
      console.log('Client timezone:', 'Europe/Istanbul');
      console.log('User settings timezone:', 'America/New_York');
      console.log('Query $gte:', query.startTime.$gte.toISOString());
      console.log('Query $lt:', query.startTime.$lt.toISOString());

      // Should use client timezone (Istanbul), not user settings (New York)
      expect(query.startTime.$gte.toISOString()).toBe('2026-02-03T21:00:00.000Z');
      expect(query.startTime.$lt.toISOString()).toBe('2026-02-04T21:00:00.000Z');
    });

    it('should find late night event with empty timezone when user has Istanbul settings', async () => {
      // The bug scenario:
      // - Event at 4 Feb 00:30 Istanbul = 3 Feb 21:30 UTC
      // - Frontend doesn't send timezone (empty string)
      // - User has Europe/Istanbul in settings
      // - Should find the event!

      const lateNightEvent = {
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(mockUserId),
        petId: new Types.ObjectId(),
        title: 'Late Night Vet Visit',
        type: 'veterinary',
        startTime: new Date('2026-02-03T21:30:00.000Z'),  // 4 Feb 00:30 Istanbul
        status: 'upcoming',
      };

      (UserSettingsModel.findOne as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue({ timezone: 'Europe/Istanbul' }),
      });

      (EventModel.find as any).mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([lateNightEvent]),
      });

      (EventModel.countDocuments as any).mockResolvedValue(1);

      // Query for 4 Feb with empty timezone
      const { events } = await eventService.getEventsByDate(
        mockUserId,
        '2026-02-04',
        {},
        ''  // Empty string - but should use user settings!
      );

      console.log('\n=== Late Night Event Bug Fix Test ===');
      console.log('Event UTC time:', lateNightEvent.startTime.toISOString());
      console.log('Event local time (Istanbul): 2026-02-04 00:30');
      console.log('Query date: 2026-02-04');
      console.log('Client timezone:', JSON.stringify(''));
      console.log('Used timezone (from settings): Europe/Istanbul');
      console.log('Events found:', events.length);

      // Should find the event!
      expect(events.length).toBe(1);
      expect(events[0].title).toBe('Late Night Vet Visit');
    });
  });

  describe('Whitespace handling', () => {
    it('should trim whitespace from timezone', async () => {
      (UserSettingsModel.findOne as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue({ timezone: 'UTC' }),
      });

      (EventModel.find as any).mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      });

      (EventModel.countDocuments as any).mockResolvedValue(0);

      // Call with whitespace-only timezone
      await eventService.getEventsByDate(
        mockUserId,
        '2026-02-04',
        {},
        '   '  // Whitespace only
      );

      const queryCall = (EventModel.find as any).mock.calls[0];
      const query = queryCall[0];

      console.log('\n=== Whitespace Timezone Test ===');
      console.log('Client timezone:', JSON.stringify('   '));
      console.log('Should fallback to user settings');
      console.log('Query $gte:', query.startTime.$gte.toISOString());

      // Should fallback to user settings (UTC)
      expect(query.startTime.$gte.toISOString()).toBe('2026-02-04T00:00:00.000Z');
    });
  });
});
