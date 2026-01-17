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
import { SubscriptionService } from '../services/subscriptionService';

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
      const petId = req.params.petId ?? (req.query.petId as string);
      const params: FeedingScheduleQueryParams = {
        ...getPaginationParams(req.query),
        isActive:
          req.query.isActive === 'true'
            ? true
            : req.query.isActive === 'false'
              ? false
              : undefined,
        foodType: req.query.foodType as string,
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
      const { id } = req.params;

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
        !scheduleData.days
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

      const schedule = await this.feedingScheduleService.createFeedingSchedule(
        userId,
        scheduleData
      );
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
      const { id } = req.params;
      const updates = req.body as UpdateFeedingScheduleRequest;

      if (!id) {
        throw createError('Feeding schedule ID is required', 400, 'MISSING_ID');
      }

      if (updates.isActive === true) {
        const existingSchedule = await this.feedingScheduleService.getFeedingScheduleById(
          userId,
          id
        );
        const isAlreadyActive = existingSchedule?.isActive === true;
        if (!isAlreadyActive) {
          const subscriptionStatus = await this.subscriptionService.getSubscriptionStatus(userId);
          if (!subscriptionStatus.hasActiveSubscription) {
            const activeScheduleCount = await FeedingScheduleModel.countDocuments({ userId, isActive: true });
            if (activeScheduleCount >= 1) {
              throw createError('Feeding schedule limit reached', 402, 'PRO_REQUIRED');
            }
          }
        }
      }

      const schedule = await this.feedingScheduleService.updateFeedingSchedule(
        userId,
        id,
        updates
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

  // DELETE /api/feeding-schedules/:id - Delete feeding schedule
  deleteFeedingSchedule = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const { id } = req.params;

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
      const petId = req.query.petId as string;
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
      const petId = req.query.petId as string;
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
      const petId = req.query.petId as string;
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
