import { NextFunction, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { HealthRecordService } from '../services/healthRecordService';
import { getPaginationParams, successResponse } from '../utils/response';
import {
  CreateHealthRecordRequest,
  HealthRecordQueryParams,
  UpdateHealthRecordRequest,
} from '../types/api';
import { createError } from '../middleware/errorHandler';
import { parseUTCDate } from '../lib/dateUtils';

export class HealthRecordController {
  private healthRecordService: HealthRecordService;

  constructor() {
    this.healthRecordService = new HealthRecordService();
  }

  // GET /api/health-records - Get all health records for authenticated user
  getAllHealthRecords = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const petId = req.query.petId as string | undefined;
      const params: HealthRecordQueryParams = {
        ...getPaginationParams(req.query),
        type: req.query.type as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
      };

      const { records, total } =
        await this.healthRecordService.getHealthRecordsByPetId(
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
      successResponse(res, records, 200, meta);
    } catch (error) {
      next(error);
    }
  };

  // GET /api/pets/:petId/health-records - Get health records for a specific pet
  getHealthRecordsByPetId = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const petId = req.params.petId ?? (req.query.petId as string);
      const params: HealthRecordQueryParams = {
        ...getPaginationParams(req.query),
        type: req.query.type as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
      };

      const { records, total } =
        await this.healthRecordService.getHealthRecordsByPetId(
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

      successResponse(res, records, 200, meta);
    } catch (error) {
      next(error);
    }
  };

  // GET /api/health-records/:id - Get health record by ID
  getHealthRecordById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const { id } = req.params;

      if (!id) {
        throw createError('Health record ID is required', 400, 'MISSING_ID');
      }

      const record = await this.healthRecordService.getHealthRecordById(
        userId,
        id
      );

      if (!record) {
        throw createError(
          'Health record not found',
          404,
          'HEALTH_RECORD_NOT_FOUND'
        );
      }

      successResponse(res, record);
    } catch (error) {
      next(error);
    }
  };

  // POST /api/health-records - Create new health record
  createHealthRecord = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const recordData = req.body as CreateHealthRecordRequest;

      // Validation
      if (
        !recordData.petId ||
        !recordData.type ||
        !recordData.title ||
        !recordData.date
      ) {
        throw createError(
          'Pet ID, type, title, and date are required',
          400,
          'MISSING_REQUIRED_FIELDS'
        );
      }

      // Convert string dates to UTC Date objects
      const nextVisitDate = recordData.nextVisitDate
        ? parseUTCDate(recordData.nextVisitDate)
        : undefined;

      if (nextVisitDate && nextVisitDate <= new Date()) {
        throw createError(
          'Next visit date must be in the future',
          400,
          'INVALID_NEXT_VISIT_DATE'
        );
      }

      const convertedRecordData = {
        ...recordData,
        date: parseUTCDate(recordData.date),
        nextVisitDate,
      };

      const record = await this.healthRecordService.createHealthRecord(userId, convertedRecordData);
      successResponse(res, record, 201);
    } catch (error) {
      next(error);
    }
  };

  // PUT /api/health-records/:id - Update health record
  updateHealthRecord = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const { id } = req.params;
      const updates = req.body as UpdateHealthRecordRequest;

      if (!id) {
        throw createError('Health record ID is required', 400, 'MISSING_ID');
      }

      const nextVisitDate =
        updates.nextVisitDate === null
          ? null
          : updates.nextVisitDate
            ? parseUTCDate(updates.nextVisitDate)
            : undefined;

      if (nextVisitDate instanceof Date && nextVisitDate <= new Date()) {
        throw createError(
          'Next visit date must be in the future',
          400,
          'INVALID_NEXT_VISIT_DATE'
        );
      }

      const convertedUpdates = {
        ...updates,
        date: updates.date ? parseUTCDate(updates.date) : undefined,
        nextVisitDate,
      };

      const record = await this.healthRecordService.updateHealthRecord(userId, id, convertedUpdates);

      if (!record) {
        throw createError(
          'Health record not found',
          404,
          'HEALTH_RECORD_NOT_FOUND'
        );
      }

      successResponse(res, record);
    } catch (error) {
      next(error);
    }
  };

  // DELETE /api/health-records/:id - Delete health record
  deleteHealthRecord = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const { id } = req.params;

      if (!id) {
        throw createError('Health record ID is required', 400, 'MISSING_ID');
      }

      const deleted = await this.healthRecordService.deleteHealthRecord(
        userId,
        id
      );

      if (!deleted) {
        throw createError(
          'Health record not found',
          404,
          'HEALTH_RECORD_NOT_FOUND'
        );
      }

      successResponse(res, { message: 'Health record deleted successfully' });
    } catch (error) {
      next(error);
    }
  };

}
