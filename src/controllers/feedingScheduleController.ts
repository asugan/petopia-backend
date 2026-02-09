import { NextFunction, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { FeedingScheduleService } from '../services/feedingScheduleService';
import {
  getPaginationParams,
  successResponse,
} from '../utils/response';
import {
  CreateFeedingScheduleRequest,
  FeedingScheduleQueryParams,
  UpdateFeedingScheduleRequest,
} from '../types/api';
import { createError } from '../middleware/errorHandler';
import { FeedingScheduleModel } from '../models/mongoose/feedingSchedule';
import { PetModel } from '../models/mongoose/pet';
import { SubscriptionService } from '../services/subscriptionService';
import { feedingReminderService } from '../services/feedingReminderService';
import { toString } from '../utils/express-utils';
import { logger } from '../utils/logger';
import { normalizeFeedingDaysInput } from '../lib/feedingDays';

export class FeedingScheduleController {
  private feedingScheduleService: FeedingScheduleService;
  private subscriptionService: SubscriptionService;

  constructor() {
    this.feedingScheduleService = new FeedingScheduleService();
    this.subscriptionService = new SubscriptionService();
  }

  // GET /api/feeding-schedules OR /api/pets/:petId/feeding-schedules - Get feeding schedules for authenticated user
  getFeedingSchedulesByPetId = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      // Support both URL params (/pets/:petId/feeding-schedules) and query string (/feeding-schedules?petId=...)
      const petId = toString(req.params.petId) || toString(req.query.petId as string | string[] | undefined);
      const params: FeedingScheduleQueryParams = {
        ...getPaginationParams(req.query),
        isActive:
          req.query.isActive === 'true'
            ? true
            : req.query.isActive === 'false'
              ? false
              : undefined,
        foodType: toString(req.query.foodType as string | string[] | undefined),
      };

      const { schedules, total } =
        await this.feedingScheduleService.getFeedingSchedulesByPetId(
          userId,
          petId,
          params
        );
      const page = params.page ?? 1;
      const limit = params.limit ?? 10;
      const meta = {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };

      successResponse(res, schedules, 200, meta);
    } catch (error) {
      next(error);
    }
  };

  // GET /api/feeding-schedules/:id - Get feeding schedule by ID
  getFeedingScheduleById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const id = toString(req.params.id);

      if (!id) {
        throw createError('Feeding schedule ID is required', 400, 'MISSING_ID');
      }

      const schedule = await this.feedingScheduleService.getFeedingScheduleById(
        userId,
        id
      );

      if (!schedule) {
        throw createError(
          'Feeding schedule not found',
          404,
          'FEEDING_SCHEDULE_NOT_FOUND'
        );
      }

      successResponse(res, schedule);
    } catch (error) {
      next(error);
    }
  };

  // POST /api/feeding-schedules - Create new feeding schedule
  createFeedingSchedule = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const scheduleData = req.body as CreateFeedingScheduleRequest;

      // Validation
      if (
        !scheduleData.petId ||
        !scheduleData.time ||
        !scheduleData.foodType ||
        !scheduleData.amount ||
        normalizeFeedingDaysInput(scheduleData.days).length === 0
      ) {
        throw createError(
          'Pet ID, time, food type, amount, and days are required',
          400,
          'MISSING_REQUIRED_FIELDS'
        );
      }

      const isActive = scheduleData.isActive ?? true;
      if (isActive) {
        const subscriptionStatus = await this.subscriptionService.getSubscriptionStatus(userId);
        if (!subscriptionStatus.hasActiveSubscription) {
          const activeScheduleCount = await FeedingScheduleModel.countDocuments({ userId, isActive: true });
          if (activeScheduleCount >= 1) {
            throw createError('Feeding schedule limit reached', 402, 'PRO_REQUIRED');
          }
        }
      }

      const schedulePayload: CreateFeedingScheduleRequest = {
        ...scheduleData,
        isActive,
        remindersEnabled: isActive,
      };

      const schedule = await this.feedingScheduleService.createFeedingSchedule(
        userId,
        schedulePayload
      );

      if (isActive) {
        try {
          const pet = await PetModel.findById(schedule.petId).select('name').lean();
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
        } catch (error) {
          logger.error('Failed to schedule feeding reminder after schedule creation', error);
        }
      }

      successResponse(res, schedule, 201);
    } catch (error) {
      next(error);
    }
  };

  // PUT /api/feeding-schedules/:id - Update feeding schedule
  updateFeedingSchedule = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const id = toString(req.params.id);
      const updates = req.body as UpdateFeedingScheduleRequest;

      if (!id) {
        throw createError('Feeding schedule ID is required', 400, 'MISSING_ID');
      }

      const existingSchedule = await this.feedingScheduleService.getFeedingScheduleById(
        userId,
        id
      );

      if (!existingSchedule) {
        throw createError(
          'Feeding schedule not found',
          404,
          'FEEDING_SCHEDULE_NOT_FOUND'
        );
      }

      const nextIsActive = updates.isActive ?? existingSchedule.isActive;

      if (nextIsActive && !existingSchedule.isActive) {
        const subscriptionStatus = await this.subscriptionService.getSubscriptionStatus(userId);
        if (!subscriptionStatus.hasActiveSubscription) {
          const activeScheduleCount = await FeedingScheduleModel.countDocuments({ userId, isActive: true });
          if (activeScheduleCount >= 1) {
            throw createError('Feeding schedule limit reached', 402, 'PRO_REQUIRED');
          }
        }
      }

      const syncedUpdates: UpdateFeedingScheduleRequest = {
        ...updates,
        isActive: nextIsActive,
        remindersEnabled: nextIsActive,
      };

      const schedule = await this.feedingScheduleService.updateFeedingSchedule(
        userId,
        id,
        syncedUpdates
      );

      if (!schedule) {
        throw createError(
          'Feeding schedule not found',
          404,
          'FEEDING_SCHEDULE_NOT_FOUND'
        );
      }

      try {
        if (schedule.isActive) {
          await feedingReminderService.cancelFeedingReminders(schedule._id.toString());
          const pet = await PetModel.findById(schedule.petId).select('name').lean();
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
          await feedingReminderService.cancelFeedingReminders(schedule._id.toString());
        }
      } catch (error) {
        logger.error('Failed to sync feeding reminders after schedule update', error);
      }

      successResponse(res, schedule);
    } catch (error) {
      next(error);
    }
  };

  // DELETE /api/feeding-schedules/:id - Delete feeding schedule
  deleteFeedingSchedule = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const id = toString(req.params.id);

      if (!id) {
        throw createError('Feeding schedule ID is required', 400, 'MISSING_ID');
      }

      const deleted = await this.feedingScheduleService.deleteFeedingSchedule(
        userId,
        id
      );

      if (!deleted) {
        throw createError(
          'Feeding schedule not found',
          404,
          'FEEDING_SCHEDULE_NOT_FOUND'
        );
      }

      successResponse(res, {
        message: 'Feeding schedule deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  // GET /api/feeding-schedules/active - Get all active feeding schedules
  getActiveSchedules = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const petId = toString(req.query.petId as string | string[] | undefined);
      const schedules = await this.feedingScheduleService.getActiveSchedules(
        userId,
        petId
      );
      successResponse(res, schedules);
    } catch (error) {
      next(error);
    }
  };

  // GET /api/feeding-schedules/today - Get today's feeding schedules
  getTodaySchedules = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const petId = toString(req.query.petId as string | string[] | undefined);
      const schedules = await this.feedingScheduleService.getTodaySchedules(
        userId,
        petId
      );
      successResponse(res, schedules);
    } catch (error) {
      next(error);
    }
  };

  // GET /api/feeding-schedules/next - Get next feeding time
  getNextFeedingTime = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const petId = toString(req.query.petId as string | string[] | undefined);
      const schedule = await this.feedingScheduleService.getNextFeedingTime(
        userId,
        petId
      );
      successResponse(res, schedule);
    } catch (error) {
      next(error);
    }
  };
}
