import { Response, Router } from 'express';
import { FeedingScheduleController } from '../controllers/feedingScheduleController';
import { validateRequest } from '../middleware/validation';
import { z } from 'zod';
import { validateObjectId } from '../utils/mongodb-validation';
import { feedingReminderService } from '../services/feedingReminderService.js';
import { logger } from '../utils/logger.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { FeedingScheduleModel } from '../models/mongoose/index.js';

const router = Router({ mergeParams: true });
const feedingScheduleController = new FeedingScheduleController();

// Validation schemas
const createFeedingScheduleSchema = z.object({
  petId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid pet ID format'),
  time: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'),
  foodType: z.string().min(1, 'Food type is required'),
  amount: z.string().min(1, 'Amount is required'),
  days: z.string().min(1, 'Days are required'),
  isActive: z.boolean().optional(),
  remindersEnabled: z.boolean().optional(),
  reminderMinutesBefore: z.number().min(1).max(1440).optional(),
});

const updateFeedingScheduleSchema = createFeedingScheduleSchema.partial();

const updateReminderSchema = z.object({
  enabled: z.boolean(),
  minutesBefore: z.number().min(1).max(1440).optional(),
});

// Routes
router.get('/active', feedingScheduleController.getActiveSchedules);

router.get('/today', feedingScheduleController.getTodaySchedules);

router.get('/next', feedingScheduleController.getNextFeedingTime);

router.get('/', feedingScheduleController.getFeedingSchedulesByPetId);

router.get('/:id', validateObjectId(), feedingScheduleController.getFeedingScheduleById);

// PUT /:id/reminder - Toggle reminder settings
router.put(
  '/:id/reminder',
  validateObjectId(),
  validateRequest(updateReminderSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { enabled, minutesBefore } = req.body;

      if (!userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
        return;
      }

      if (!id) {
        res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Schedule ID is required' } });
        return;
      }

      // Get the schedule
      const schedule = await FeedingScheduleModel.findOne({ _id: id, userId });

      if (!schedule) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Feeding schedule not found' } });
        return;
      }

      // Update reminder settings
      schedule.remindersEnabled = enabled as boolean;
      if (minutesBefore !== undefined) {
        schedule.reminderMinutesBefore = minutesBefore as number;
      }

      // If enabling reminders, calculate next notification time
      if (enabled) {
        const nextFeedingTime = feedingReminderService.calculateNextFeedingTime(schedule.time, schedule.days);
        if (nextFeedingTime) {
          const reminderMinutesBefore = schedule.reminderMinutesBefore ?? 15;
          schedule.nextNotificationTime = new Date(nextFeedingTime.getTime() - reminderMinutesBefore * 60 * 1000);
        }
      } else {
        schedule.nextNotificationTime = undefined;
      }

      await schedule.save();

      // Cancel or schedule reminders
      if (enabled) {
        const { PetModel } = await import('../models/mongoose/index.js');
        const pet = await PetModel.findById(schedule.petId);

        await feedingReminderService.scheduleFeedingReminder({
          scheduleId: schedule._id.toString(),
          userId,
          petId: schedule.petId.toString(),
          petName: pet?.name ?? 'your pet',
          time: schedule.time,
          foodType: schedule.foodType,
          amount: schedule.amount,
          days: schedule.days,
          reminderMinutesBefore: schedule.reminderMinutesBefore ?? 15,
        });
      } else {
        await feedingReminderService.cancelFeedingReminders(id);
      }

      res.json({
        success: true,
        data: {
          remindersEnabled: schedule.remindersEnabled,
          reminderMinutesBefore: schedule.reminderMinutesBefore,
          nextNotificationTime: schedule.nextNotificationTime,
        },
      });
    } catch (error) {
      logger.error('Error updating reminder settings:', error);
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update reminder settings' } });
    }
  }
);

// POST /:id/reminder - Manually trigger a reminder
router.post(
  '/:id/reminder',
  validateObjectId(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
        return;
      }

      if (!id) {
        res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Schedule ID is required' } });
        return;
      }

      const result = await feedingReminderService.sendFeedingReminder(id, userId);

      if (!result.success) {
        res.status(500).json({ success: false, error: { code: 'REMINDER_FAILED', message: result.error } });
        return;
      }

      res.json({
        success: true,
        data: { scheduledCount: result.scheduledCount },
      });
    } catch (error) {
      logger.error('Error sending feeding reminder:', error);
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to send reminder' } });
    }
  }
);

// GET /:id/notifications - Get notification status for a schedule
router.get(
  '/:id/notifications',
  validateObjectId(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
        return;
      }

      if (!id) {
        res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Schedule ID is required' } });
        return;
      }

      // Verify schedule belongs to user
      const schedule = await FeedingScheduleModel.findOne({ _id: id, userId });

      if (!schedule) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Feeding schedule not found' } });
        return;
      }

      const notificationStatus = await feedingReminderService.getScheduleNotifications(id);

      res.json({
        success: true,
        data: {
          scheduleId: id,
          remindersEnabled: schedule.remindersEnabled,
          nextNotificationTime: schedule.nextNotificationTime,
          lastNotificationAt: schedule.lastNotificationAt,
          notifications: notificationStatus,
        },
      });
    } catch (error) {
      logger.error('Error getting notification status:', error);
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get notification status' } });
    }
  }
);

// POST /:id/complete - Mark feeding as completed
router.post(
  '/:id/complete',
  validateObjectId(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
        return;
      }

      if (!id) {
        res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Schedule ID is required' } });
        return;
      }

      const result = await feedingReminderService.markFeedingCompleted(id, userId);

      if (!result.success) {
        res.status(500).json({ success: false, error: { code: 'COMPLETION_FAILED', message: result.error } });
        return;
      }

      res.json({ success: true, data: { message: 'Feeding marked as completed' } });
    } catch (error) {
      logger.error('Error marking feeding as completed:', error);
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to mark feeding as completed' } });
    }
  }
);

router.post(
  '/',
  validateRequest(createFeedingScheduleSchema),
  feedingScheduleController.createFeedingSchedule
);

router.put(
  '/:id',
  validateObjectId(),
  validateRequest(updateFeedingScheduleSchema),
  feedingScheduleController.updateFeedingSchedule
);

router.delete('/:id', validateObjectId(), feedingScheduleController.deleteFeedingSchedule);

export default router;
