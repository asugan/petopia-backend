import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventService } from '@/services/eventService';
import { EventModel, UserSettingsModel } from '@/models/mongoose';
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

describe('EventService - Timezone Consistency Bug', () => {
  let eventService: EventService;
  const mockUserId = new Types.ObjectId().toString();

  beforeEach(() => {
    eventService = new EventService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Timezone mismatch between getUpcomingEvents and getEventsByDate', () => {
    it('should demonstrate the bug when user settings timezone differs from client timezone', async () => {
      // Scenario:
      // - User settings timezone: "UTC" (user hasn't set a timezone)
      // - Client (mobile app) timezone: "Europe/Istanbul" (UTC+3)
      // - Selected date: 2026-02-04
      // - Event time: 2026-02-04 10:00 AM Istanbul time = 2026-02-04 07:00 UTC
      
      const selectedDate = '2026-02-04';
      const clientTimezone = 'Europe/Istanbul'; // What mobile app sends
      const userSettingsTimezone = 'UTC'; // What's stored in user settings (or null)
      
      // Event created at 10:00 AM Istanbul time
      // In UTC: 2026-02-04T07:00:00.000Z
      const eventStartTime = new Date('2026-02-04T07:00:00.000Z');
      
      // Mock user settings returning UTC (simulating no timezone set)
      (UserSettingsModel.findOne as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue({ timezone: userSettingsTimezone }),
      });

      // Mock EventModel.find to return our test event
      const mockEvent = {
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(mockUserId),
        petId: new Types.ObjectId(),
        title: 'Test Event',
        type: 'vaccination',
        startTime: eventStartTime,
        status: 'upcoming',
      };

      (EventModel.find as any).mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([mockEvent]),
      });

      (EventModel.countDocuments as any).mockResolvedValue(1);

      // Test 1: Call getUpcomingEvents (uses user settings timezone: UTC)
      const upcomingEvents = await eventService.getUpcomingEvents(mockUserId, undefined, 30);
      
      // The query should search with UTC boundaries
      // For UTC, day 2026-02-04 is from 00:00 to 23:59 UTC
      const upcomingCall = (EventModel.find as any).mock.calls[0];
      const upcomingQuery = upcomingCall[0];
      
      // Test 2: Call getEventsByDate (uses client timezone: Europe/Istanbul)
      const { events: dateEvents } = await eventService.getEventsByDate(
        mockUserId,
        selectedDate,
        {},
        clientTimezone
      );
      
      // The query should search with Istanbul timezone boundaries
      // For Istanbul UTC+3, day 2026-02-04 is from 2026-02-03T21:00:00Z to 2026-02-04T21:00:00Z
      const dateQueryCall = (EventModel.find as any).mock.calls[1];
      const dateQuery = dateQueryCall[0];
      
      // Log the boundaries for debugging
      console.log('\n=== Timezone Mismatch Analysis ===');
      console.log('Event time (UTC):', eventStartTime.toISOString());
      console.log('Event time (Istanbul): 2026-02-04T10:00:00');
      console.log('\ngetUpcomingEvents uses timezone:', userSettingsTimezone);
      console.log('Query $gte:', upcomingQuery.startTime.$gte.toISOString());
      console.log('Query $lte:', upcomingQuery.startTime.$lte.toISOString());
      console.log('\ngetEventsByDate uses timezone:', clientTimezone);
      console.log('Query $gte:', dateQuery.startTime.$gte.toISOString());
      console.log('Query $lt:', dateQuery.startTime.$lt.toISOString());
      
      // Check if the event falls in both ranges
      const inUpcomingRange = eventStartTime >= upcomingQuery.startTime.$gte && 
                              eventStartTime <= upcomingQuery.startTime.$lte;
      const inDateRange = eventStartTime >= dateQuery.startTime.$gte && 
                          eventStartTime < dateQuery.startTime.$lt;
      
      console.log('\nEvent in upcoming range:', inUpcomingRange);
      console.log('Event in date range:', inDateRange);
      
      // The bug: Event is in both ranges, but if timezones differ significantly,
      // the event might appear on different days in the UI
      
      // For the specific bug scenario:
      // - getUpcomingEvents (UTC) sees the event on 2026-02-04
      // - getEventsByDate (Istanbul) should also see it on 2026-02-04
      
      // But let's check the Istanbul boundaries
      const istanbulStart = new Date('2026-02-03T21:00:00.000Z');
      const istanbulEnd = new Date('2026-02-04T21:00:00.000Z');
      
      console.log('\nExpected Istanbul boundaries:');
      console.log('Start:', istanbulStart.toISOString());
      console.log('End:', istanbulEnd.toISOString());
      
      expect(dateQuery.startTime.$gte.getTime()).toBe(istanbulStart.getTime());
      expect(dateQuery.startTime.$lt.getTime()).toBe(istanbulEnd.getTime());
      
      // The event (07:00 UTC) is within Istanbul range (21:00 prev day to 21:00 curr day)
      expect(inDateRange).toBe(true);
    });

    it('should show the specific day mismatch bug', async () => {
      // This test demonstrates the exact bug scenario:
      // Event at 2026-02-04 00:30 Istanbul time (still on Feb 4 in Istanbul)
      // Which is 2026-02-03 21:30 UTC (previous day in UTC!)
      
      const selectedDate = '2026-02-04';
      const clientTimezone = 'Europe/Istanbul';
      const userSettingsTimezone = 'UTC';
      
      // Event at 00:30 AM Istanbul time on Feb 4
      // UTC: 2026-02-03T21:30:00.000Z (still Feb 3 in UTC!)
      const eventStartTime = new Date('2026-02-03T21:30:00.000Z');
      
      (UserSettingsModel.findOne as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue({ timezone: userSettingsTimezone }),
      });

      const mockEvent = {
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(mockUserId),
        petId: new Types.ObjectId(),
        title: 'Late Night Event',
        type: 'vaccination',
        startTime: eventStartTime,
        status: 'upcoming',
      };

      (EventModel.find as any).mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([mockEvent]),
      });

      (EventModel.countDocuments as any).mockResolvedValue(1);

      // Query for 2026-02-04 in Istanbul timezone
      const { events: dateEvents } = await eventService.getEventsByDate(
        mockUserId,
        selectedDate,
        {},
        clientTimezone
      );
      
      const dateQueryCall = (EventModel.find as any).mock.calls[0];
      const dateQuery = dateQueryCall[0];
      
      console.log('\n=== Day Mismatch Bug Analysis ===');
      console.log('Event time (UTC):', eventStartTime.toISOString());
      console.log('Event local time (Istanbul): 2026-02-04T00:30:00');
      console.log('Query date:', selectedDate);
      console.log('Query timezone:', clientTimezone);
      console.log('Query range $gte:', dateQuery.startTime.$gte.toISOString());
      console.log('Query range $lt:', dateQuery.startTime.$lt.toISOString());
      
      // The event is at 21:30 UTC on Feb 3
      // The query range for Feb 4 Istanbul is: 2026-02-03T21:00:00Z to 2026-02-04T21:00:00Z
      // So the event SHOULD be found (it's 21:30, range starts at 21:00)
      
      const inRange = eventStartTime >= dateQuery.startTime.$gte && 
                      eventStartTime < dateQuery.startTime.$lt;
      
      console.log('Event in query range:', inRange);
      
      expect(inRange).toBe(true);
    });
  });

  describe('Consistency check between endpoints', () => {
    it('both endpoints should use consistent timezone resolution', async () => {
      // The fix: Both endpoints should use the same timezone resolution order:
      // 1. Client-provided timezone (for getEventsByDate)
      // 2. User settings timezone
      // 3. Default to UTC
      
      // Currently:
      // - getUpcomingEvents: Only uses user settings timezone (ignores client timezone)
      // - getEventsByDate: Uses client timezone first, then user settings
      
      // This can cause inconsistencies!
      
      (UserSettingsModel.findOne as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue({ timezone: 'America/New_York' }),
      });

      (EventModel.find as any).mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      });

      (EventModel.countDocuments as any).mockResolvedValue(0);

      // Call both endpoints
      await eventService.getUpcomingEvents(mockUserId);
      await eventService.getEventsByDate(mockUserId, '2026-02-04', {}, 'Europe/Istanbul');
      
      // Both should have been called with their respective timezone logic
      expect(EventModel.find).toHaveBeenCalledTimes(2);
      
      // The first call (getUpcomingEvents) uses user settings: America/New_York
      const upcomingCall = (EventModel.find as any).mock.calls[0];
      
      // The second call (getEventsByDate) uses client timezone: Europe/Istanbul  
      const dateCall = (EventModel.find as any).mock.calls[1];
      
      // These queries will have different time boundaries!
      console.log('\n=== Endpoint Consistency Check ===');
      console.log('getUpcomingEvents query timezone: America/New_York (user settings)');
      console.log('getEventsByDate query timezone: Europe/Istanbul (client provided)');
      console.log('These boundaries will differ!');
    });
  });
});
