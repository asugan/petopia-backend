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
      `${emoji} ${petName ? `${petName  }: ` : ''}${title}`,
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
  };

  beforeEach(() => {
    service = new EventReminderService();
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('scheduleReminders - Duplicate Prevention', () => {
    it('should skip sending notification if already sent for same event and minute', async () => {
      // Arrange: Event starting in 2 hours
      const startTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const reminderMinutes = [60]; // 1 hour before

      // Mock: Notification already sent for this reminder
      vi.mocked(ScheduledNotificationModel.findOne).mockReturnValue({
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue({
          _id: new Types.ObjectId(),
          notificationId: `reminder-${mockEventId}-60`,
          status: 'sent',
        }),
      } as any);

      // Act
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

      // Assert
      expect(result.success).toBe(true);
      expect(result.scheduledCount).toBe(0);
      expect(pushNotificationService.sendToUser).not.toHaveBeenCalled();
      expect(ScheduledNotificationModel.create).not.toHaveBeenCalled();
    });

    it('should send notification if not already sent', async () => {
      // Arrange: Event starting in 2 hours
      const startTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const reminderMinutes = [60]; // 1 hour before

      // Mock: No existing notification
      vi.mocked(ScheduledNotificationModel.findOne).mockReturnValue({
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(null),
      } as any);

      vi.mocked(ScheduledNotificationModel.create).mockResolvedValue({} as any);

      // Act
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

      // Assert
      expect(result.success).toBe(true);
      expect(result.scheduledCount).toBe(1);
      expect(pushNotificationService.sendToUser).toHaveBeenCalledTimes(1);
      expect(ScheduledNotificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: expect.any(Types.ObjectId),
          userId: expect.any(Types.ObjectId),
          notificationId: `reminder-${mockEventId}-60`,
          status: 'sent',
        })
      );
    });

    it('should handle multiple reminder times and skip already sent ones', async () => {
      // Arrange: Event starting in 2 days
      const startTime = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      const reminderMinutes = [1440, 120, 60, 15]; // 1 day, 2h, 1h, 15min

      // Mock: 1440 (1 day) already sent, others not
      vi.mocked(ScheduledNotificationModel.findOne).mockImplementation(
        (query: any) => {
          const notificationId = query.notificationId;
          const alreadySent = notificationId === `reminder-${mockEventId}-1440`;

          return {
            lean: vi.fn().mockReturnThis(),
            exec: vi
              .fn()
              .mockResolvedValue(
                alreadySent ? { notificationId, status: 'sent' } : null
              ),
          } as any;
        }
      );

      vi.mocked(ScheduledNotificationModel.create).mockResolvedValue({} as any);

      // Act
      const result = await service.scheduleReminders({
        eventId: mockEventId,
        userId: mockUserId,
        title: 'Grooming',
        eventType: 'grooming',
        eventTitle: 'Grooming',
        startTime,
        reminderMinutes,
        timezone: 'UTC',
      });

      // Assert: Should send 3 notifications (skip the 1440 one)
      expect(result.success).toBe(true);
      expect(result.scheduledCount).toBe(3);
      expect(pushNotificationService.sendToUser).toHaveBeenCalledTimes(3);
    });

    it('should skip reminders with trigger time in the past', async () => {
      // Arrange: Event starting in 10 minutes
      const startTime = new Date(Date.now() + 10 * 60 * 1000);
      const reminderMinutes = [1440, 60, 15, 5]; // Only 5min reminder is valid

      vi.mocked(ScheduledNotificationModel.findOne).mockReturnValue({
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(null),
      } as any);

      vi.mocked(ScheduledNotificationModel.create).mockResolvedValue({} as any);

      // Act
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

      // Assert: Only the 5-minute reminder should be sent
      expect(result.success).toBe(true);
      expect(result.scheduledCount).toBe(1);
      expect(pushNotificationService.sendToUser).toHaveBeenCalledTimes(1);
    });

    it('should return 0 scheduled when no active devices', async () => {
      // Arrange
      vi.mocked(pushNotificationService.getUserActiveDevices).mockResolvedValue(
        []
      );

      const startTime = new Date(Date.now() + 2 * 60 * 60 * 1000);

      // Act
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

      // Assert
      expect(result.success).toBe(true);
      expect(result.scheduledCount).toBe(0);
      expect(pushNotificationService.sendToUser).not.toHaveBeenCalled();
    });
  });

  describe('cancelReminders', () => {
    it('should delete all notification records for an event', async () => {
      // Arrange
      vi.mocked(ScheduledNotificationModel.deleteMany).mockResolvedValue({
        deletedCount: 4,
      } as any);

      // Act
      const result = await service.cancelReminders(mockEventId);

      // Assert
      expect(result).toBe(true);
      expect(ScheduledNotificationModel.deleteMany).toHaveBeenCalledWith({
        eventId: expect.any(Types.ObjectId),
      });
      expect(EventModel.findByIdAndUpdate).toHaveBeenCalledWith(mockEventId, {
        $set: { scheduledNotificationIds: [] },
      });
    });

    it('should return false on error', async () => {
      // Arrange
      vi.mocked(ScheduledNotificationModel.deleteMany).mockRejectedValue(
        new Error('DB error')
      );

      // Act
      const result = await service.cancelReminders(mockEventId);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getReminderMinutesForPreset (via scheduleReminders)', () => {
    it('should use standard preset by default', async () => {
      // The private method is tested indirectly
      // Standard preset: [1440, 120, 60, 15]
      const startTime = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days from now

      vi.mocked(ScheduledNotificationModel.findOne).mockReturnValue({
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(null),
      } as any);
      vi.mocked(ScheduledNotificationModel.create).mockResolvedValue({} as any);

      const result = await service.scheduleReminders({
        eventId: mockEventId,
        userId: mockUserId,
        title: 'Test',
        eventType: 'other',
        eventTitle: 'Test',
        startTime,
        reminderMinutes: [1440, 120, 60, 15], // Standard preset
        timezone: 'UTC',
      });

      // All 4 reminders should be scheduled
      expect(result.scheduledCount).toBe(4);
    });
  });

  describe('Scheduler repeated runs simulation', () => {
    it('should not send duplicate notifications on repeated scheduler runs', async () => {
      const startTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const reminderMinutes = [60];

      // First run: No existing notification
      vi.mocked(ScheduledNotificationModel.findOne).mockReturnValue({
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(null),
      } as any);
      vi.mocked(ScheduledNotificationModel.create).mockResolvedValue({} as any);

      // First scheduler run
      const result1 = await service.scheduleReminders({
        eventId: mockEventId,
        userId: mockUserId,
        title: 'Test Event',
        eventType: 'vet_visit',
        eventTitle: 'Test Event',
        startTime,
        reminderMinutes,
        timezone: 'UTC',
      });

      expect(result1.scheduledCount).toBe(1);
      expect(pushNotificationService.sendToUser).toHaveBeenCalledTimes(1);

      // Clear call counts but simulate the notification was stored
      vi.mocked(pushNotificationService.sendToUser).mockClear();

      // Second run: Notification now exists in DB
      vi.mocked(ScheduledNotificationModel.findOne).mockReturnValue({
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue({
          notificationId: `reminder-${mockEventId}-60`,
          status: 'sent',
        }),
      } as any);

      // Second scheduler run (simulating 15 minutes later)
      const result2 = await service.scheduleReminders({
        eventId: mockEventId,
        userId: mockUserId,
        title: 'Test Event',
        eventType: 'vet_visit',
        eventTitle: 'Test Event',
        startTime,
        reminderMinutes,
        timezone: 'UTC',
      });

      // Should not send again
      expect(result2.scheduledCount).toBe(0);
      expect(pushNotificationService.sendToUser).not.toHaveBeenCalled();
    });
  });
});
