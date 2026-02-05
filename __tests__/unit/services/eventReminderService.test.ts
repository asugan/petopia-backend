import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';

// Mock dependencies before importing the service
vi.mock('@/services/pushNotificationService', () => ({
  pushNotificationService: {
    getUserActiveDevices: vi.fn(),
    sendToUser: vi.fn(),
  },
}));

vi.mock('@/models/mongoose/scheduledNotifications', () => ({
  ScheduledNotificationModel: {
    findOne: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock('@/models/mongoose/index', () => ({
  EventModel: {
    findByIdAndUpdate: vi.fn(),
    find: vi.fn(),
  },
  UserSettingsModel: {
    findOne: vi.fn(),
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/config/notificationMessages', () => ({
  getEventReminderMessages: vi.fn(() => ({
    getTitle: (emoji: string, petName: string | undefined, title: string) =>
      `${emoji} ${petName ? `${petName}: ` : ''}${title}`,
    getTimeOffset: (minutes: number) => `${minutes} min before`,
  })),
}));

// Import after mocks are set up
import { EventReminderService } from '@/services/eventReminderService';
import { pushNotificationService } from '@/services/pushNotificationService';
import { ScheduledNotificationModel } from '@/models/mongoose/scheduledNotifications';
import { EventModel, UserSettingsModel } from '@/models/mongoose/index';

describe('EventReminderService', () => {
  let service: EventReminderService;

  const mockUserId = new Types.ObjectId().toString();
  const mockEventId = new Types.ObjectId().toString();
  const mockDeviceToken = 'ExponentPushToken[xxxxx]';

  // Helper to setup default mocks
  const setupDefaultMocks = () => {
    // Mock getUserActiveDevices
    vi.mocked(pushNotificationService.getUserActiveDevices).mockResolvedValue([
      mockDeviceToken,
    ]);

    // Mock sendToUser
    vi.mocked(pushNotificationService.sendToUser).mockResolvedValue({
      sent: 1,
      failed: 0,
      tokensToRemove: [],
    });

    // Mock UserSettingsModel.findOne
    vi.mocked(UserSettingsModel.findOne).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue({ language: 'en' }),
    } as any);

    // Mock EventModel.findByIdAndUpdate
    vi.mocked(EventModel.findByIdAndUpdate).mockReturnValue({
      exec: vi.fn().mockResolvedValue({}),
    } as any);

    // Mock ScheduledNotificationModel.findOne - default no existing
    vi.mocked(ScheduledNotificationModel.findOne).mockReturnValue({
      lean: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(null),
    } as any);

    // Mock ScheduledNotificationModel.create
    vi.mocked(ScheduledNotificationModel.create).mockResolvedValue({} as any);
  };

  beforeEach(() => {
    service = new EventReminderService();
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('scheduleReminders - Timing Logic', () => {
    it('should NOT send notification if trigger time has not arrived yet', async () => {
      // Event in 2 hours, 60-minute reminder = trigger in 1 hour (future)
      const startTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const reminderMinutes = [60]; // triggerTime = 1 hour from now

      const result = await service.scheduleReminders({
        eventId: mockEventId,
        userId: mockUserId,
        title: 'Vet Visit',
        eventType: 'vet_visit',
        eventTitle: 'Vet Visit',
        startTime,
        reminderMinutes,
        timezone: 'UTC',
      });

      // Trigger time hasn't arrived, should not send
      expect(result.success).toBe(true);
      expect(result.scheduledCount).toBe(0);
      expect(pushNotificationService.sendToUser).not.toHaveBeenCalled();
    });

    it('should send notification when trigger time has just arrived (within grace window)', async () => {
      // Event in 60 minutes, 60-minute reminder = trigger NOW
      const startTime = new Date(Date.now() + 60 * 60 * 1000);
      const reminderMinutes = [60]; // triggerTime = now

      const result = await service.scheduleReminders({
        eventId: mockEventId,
        userId: mockUserId,
        title: 'Vet Visit',
        eventType: 'vet_visit',
        eventTitle: 'Vet Visit',
        startTime,
        reminderMinutes,
        timezone: 'UTC',
      });

      // Trigger time just arrived, should send
      expect(result.success).toBe(true);
      expect(result.scheduledCount).toBe(1);
      expect(pushNotificationService.sendToUser).toHaveBeenCalledTimes(1);
    });

    it('should send notification if trigger time passed but within grace window (10 min ago)', async () => {
      // Event in 50 minutes, 60-minute reminder = trigger was 10 min ago
      const startTime = new Date(Date.now() + 50 * 60 * 1000);
      const reminderMinutes = [60]; // triggerTime = 10 min ago (within 15 min grace)

      const result = await service.scheduleReminders({
        eventId: mockEventId,
        userId: mockUserId,
        title: 'Vet Visit',
        eventType: 'vet_visit',
        eventTitle: 'Vet Visit',
        startTime,
        reminderMinutes,
        timezone: 'UTC',
      });

      // Within grace window, should send
      expect(result.success).toBe(true);
      expect(result.scheduledCount).toBe(1);
      expect(pushNotificationService.sendToUser).toHaveBeenCalledTimes(1);
    });

    it('should NOT send notification if trigger time passed and outside grace window (35 min ago)', async () => {
      // Event in 25 minutes, 60-minute reminder = trigger was 35 min ago
      const startTime = new Date(Date.now() + 25 * 60 * 1000);
      const reminderMinutes = [60]; // triggerTime = 35 min ago (outside 30 min grace)

      const result = await service.scheduleReminders({
        eventId: mockEventId,
        userId: mockUserId,
        title: 'Vet Visit',
        eventType: 'vet_visit',
        eventTitle: 'Vet Visit',
        startTime,
        reminderMinutes,
        timezone: 'UTC',
      });

      // Outside grace window, should NOT send
      expect(result.success).toBe(true);
      expect(result.scheduledCount).toBe(0);
      expect(pushNotificationService.sendToUser).not.toHaveBeenCalled();
    });

    it('should only send reminders whose trigger time has arrived', async () => {
      // Event in 150 minutes from now
      // 120 min reminder = trigger in 30 min (future) - skip
      // 60 min reminder = trigger in 90 min (future) - skip
      // 15 min reminder = trigger in 135 min (future) - skip
      const startTime = new Date(Date.now() + 150 * 60 * 1000);
      const reminderMinutes = [120, 60, 15];

      const result = await service.scheduleReminders({
        eventId: mockEventId,
        userId: mockUserId,
        title: 'Walk',
        eventType: 'walk',
        eventTitle: 'Walk',
        startTime,
        reminderMinutes,
        timezone: 'UTC',
      });

      // None of the reminders have arrived yet (all in future)
      expect(result.success).toBe(true);
      expect(result.scheduledCount).toBe(0);
    });

    it('should send multiple reminders if they are all within grace window', async () => {
      // Event in 60 minutes
      // 60 min reminder = trigger now (valid)
      // 65 min reminder = trigger 5 min ago (valid, within grace)
      const startTime = new Date(Date.now() + 60 * 60 * 1000);
      const reminderMinutes = [60, 65]; // Both should trigger now or recently

      const result = await service.scheduleReminders({
        eventId: mockEventId,
        userId: mockUserId,
        title: 'Feeding',
        eventType: 'feeding',
        eventTitle: 'Feeding',
        startTime,
        reminderMinutes,
        timezone: 'UTC',
      });

      // Both are valid
      expect(result.success).toBe(true);
      expect(result.scheduledCount).toBe(2);
      expect(pushNotificationService.sendToUser).toHaveBeenCalledTimes(2);
    });
  });

  describe('scheduleReminders - Duplicate Prevention', () => {
    it('should skip sending notification if already sent', async () => {
      // Event in 60 minutes, trigger time is now
      const startTime = new Date(Date.now() + 60 * 60 * 1000);
      const reminderMinutes = [60];

      // Mock: Notification already sent
      vi.mocked(ScheduledNotificationModel.findOne).mockReturnValue({
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue({
          notificationId: `reminder-${mockEventId}-60`,
          status: 'sent',
        }),
      } as any);

      const result = await service.scheduleReminders({
        eventId: mockEventId,
        userId: mockUserId,
        title: 'Vet Visit',
        eventType: 'vet_visit',
        eventTitle: 'Vet Visit',
        startTime,
        reminderMinutes,
        timezone: 'UTC',
      });

      expect(result.success).toBe(true);
      expect(result.scheduledCount).toBe(0);
      expect(pushNotificationService.sendToUser).not.toHaveBeenCalled();
    });

    it('should send notification if not already sent', async () => {
      // Event in 60 minutes, trigger time is now
      const startTime = new Date(Date.now() + 60 * 60 * 1000);
      const reminderMinutes = [60];

      const result = await service.scheduleReminders({
        eventId: mockEventId,
        userId: mockUserId,
        title: 'Vet Visit',
        eventType: 'vet_visit',
        eventTitle: 'Vet Visit',
        startTime,
        reminderMinutes,
        timezone: 'UTC',
      });

      expect(result.success).toBe(true);
      expect(result.scheduledCount).toBe(1);
      expect(pushNotificationService.sendToUser).toHaveBeenCalledTimes(1);
      expect(ScheduledNotificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationId: `reminder-${mockEventId}-60`,
          status: 'sent',
        })
      );
    });
  });

  describe('scheduleReminders - Edge Cases', () => {
    it('should return 0 scheduled when no active devices', async () => {
      vi.mocked(pushNotificationService.getUserActiveDevices).mockResolvedValue([]);

      const startTime = new Date(Date.now() + 60 * 60 * 1000);

      const result = await service.scheduleReminders({
        eventId: mockEventId,
        userId: mockUserId,
        title: 'Feeding',
        eventType: 'feeding',
        eventTitle: 'Feeding',
        startTime,
        reminderMinutes: [60],
        timezone: 'UTC',
      });

      expect(result.success).toBe(true);
      expect(result.scheduledCount).toBe(0);
      expect(pushNotificationService.sendToUser).not.toHaveBeenCalled();
    });

    it('should handle event starting exactly at grace window boundary', async () => {
      // Event in 45 minutes, 60-minute reminder = trigger was 15 min ago (exactly at boundary)
      const startTime = new Date(Date.now() + 45 * 60 * 1000);
      const reminderMinutes = [60]; // triggerTime = 15 min ago

      const result = await service.scheduleReminders({
        eventId: mockEventId,
        userId: mockUserId,
        title: 'Walk',
        eventType: 'walk',
        eventTitle: 'Walk',
        startTime,
        reminderMinutes,
        timezone: 'UTC',
      });

      // Exactly at 15 min boundary, should still send (<=)
      expect(result.success).toBe(true);
      expect(result.scheduledCount).toBe(1);
    });
  });

  describe('cancelReminders', () => {
    it('should delete all notification records for an event', async () => {
      vi.mocked(ScheduledNotificationModel.deleteMany).mockResolvedValue({
        deletedCount: 4,
      } as any);

      const result = await service.cancelReminders(mockEventId);

      expect(result).toBe(true);
      expect(ScheduledNotificationModel.deleteMany).toHaveBeenCalledWith({
        eventId: expect.any(Types.ObjectId),
      });
      expect(EventModel.findByIdAndUpdate).toHaveBeenCalledWith(mockEventId, {
        $set: { scheduledNotificationIds: [] },
      });
    });

    it('should return false on error', async () => {
      vi.mocked(ScheduledNotificationModel.deleteMany).mockRejectedValue(
        new Error('DB error')
      );

      const result = await service.cancelReminders(mockEventId);

      expect(result).toBe(false);
    });
  });

  describe('Scheduler simulation - Real world scenario', () => {
    it('should correctly handle scheduler runs for an event with multiple reminders', async () => {
      // Simulate: Event at 19:00, current time is 17:00
      // Reminders: 2h (17:00), 1h (18:00), 15min (18:45)
      
      // First scheduler run at 17:00 - should send 2h reminder
      const eventTime = new Date();
      eventTime.setHours(19, 0, 0, 0);
      
      // Simulate "now" is exactly 2 hours before event (17:00)
      const twoHoursBefore = new Date(eventTime.getTime() - 2 * 60 * 60 * 1000);
      vi.setSystemTime(twoHoursBefore);

      const reminderMinutes = [120, 60, 15]; // 2h, 1h, 15min

      const result1 = await service.scheduleReminders({
        eventId: mockEventId,
        userId: mockUserId,
        title: 'Vet Visit',
        eventType: 'vet_visit',
        eventTitle: 'Vet Visit',
        startTime: eventTime,
        reminderMinutes,
        timezone: 'UTC',
      });

      // Only 2h reminder should be sent (its trigger time is now)
      expect(result1.scheduledCount).toBe(1);
      expect(pushNotificationService.sendToUser).toHaveBeenCalledTimes(1);

      // Reset for next test
      vi.useRealTimers();
    });
  });
});
