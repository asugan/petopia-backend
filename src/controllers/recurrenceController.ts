import { NextFunction, Request, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { RecurrenceService } from '../services/recurrenceService';
import { getPaginationParams, successResponse } from '../utils/response';
import {
  CreateRecurrenceRuleRequest,
  RecurrenceRuleQueryParams,
  UpdateRecurrenceRuleRequest,
} from '../types/api';
import { createError } from '../middleware/errorHandler';
import { toString } from '../utils/express-utils';

export class RecurrenceController {
  private recurrenceService: RecurrenceService;

  constructor() {
    this.recurrenceService = new RecurrenceService();
  }

  // GET /api/recurrence-rules - Get all recurrence rules for authenticated user
  getRules = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const params: RecurrenceRuleQueryParams = {
        ...getPaginationParams(req.query),
        isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
        petId: toString(req.query.petId as string | string[] | undefined),
      };

      const { rules, total } = await this.recurrenceService.getRules(userId, params);
      const page = params.page ?? 1;
      const limit = params.limit ?? 20;
      const meta = {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };

      successResponse(res, rules, 200, meta);
    } catch (error) {
      next(error);
    }
  };

  // GET /api/recurrence-rules/:id - Get a single recurrence rule
  getRuleById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const id = toString(req.params.id);

      if (!id) {
        throw createError('Recurrence rule ID is required', 400, 'MISSING_ID');
      }

      const rule = await this.recurrenceService.getRuleById(userId, id);

      if (!rule) {
        throw createError('Recurrence rule not found', 404, 'RULE_NOT_FOUND');
      }

      successResponse(res, rule);
    } catch (error) {
      next(error);
    }
  };

  // POST /api/recurrence-rules - Create a new recurrence rule
  createRule = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const data = req.body as CreateRecurrenceRuleRequest;

      // Validation
      if (!data.petId || !data.title || !data.type || !data.frequency || !data.startDate || !data.timezone) {
        throw createError(
          'Pet ID, title, type, frequency, start date, and timezone are required',
          400,
          'MISSING_REQUIRED_FIELDS'
        );
      }

      const { rule, eventsCreated } = await this.recurrenceService.createRule(userId, data);

      successResponse(res, { rule, eventsCreated }, 201);
    } catch (error) {
      next(error);
    }
  };

  // PUT /api/recurrence-rules/:id - Update a recurrence rule
  updateRule = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const id = toString(req.params.id);
      const data = req.body as UpdateRecurrenceRuleRequest;

      if (!id) {
        throw createError('Recurrence rule ID is required', 400, 'MISSING_ID');
      }

      const { rule, eventsUpdated } = await this.recurrenceService.updateRule(userId, id, data);

      if (!rule) {
        throw createError('Recurrence rule not found', 404, 'RULE_NOT_FOUND');
      }

      successResponse(res, { rule, eventsUpdated });
    } catch (error) {
      next(error);
    }
  };

  // DELETE /api/recurrence-rules/:id - Delete a recurrence rule
  deleteRule = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const id = toString(req.params.id);

      if (!id) {
        throw createError('Recurrence rule ID is required', 400, 'MISSING_ID');
      }

      const { deleted, eventsDeleted } = await this.recurrenceService.deleteRule(userId, id);

      if (!deleted) {
        throw createError('Recurrence rule not found', 404, 'RULE_NOT_FOUND');
      }

      successResponse(res, { message: 'Recurrence rule deleted successfully', eventsDeleted });
    } catch (error) {
      next(error);
    }
  };

  // POST /api/recurrence-rules/:id/regenerate - Regenerate events for a rule
  regenerateEvents = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const id = toString(req.params.id);

      if (!id) {
        throw createError('Recurrence rule ID is required', 400, 'MISSING_ID');
      }

      const { deleted, created } = await this.recurrenceService.regenerateEvents(userId, id);

      successResponse(res, { eventsDeleted: deleted, eventsCreated: created });
    } catch (error) {
      next(error);
    }
  };

  // GET /api/recurrence-rules/:id/events - Get events for a rule
  getEventsByRuleId = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const id = toString(req.params.id);

      if (!id) {
        throw createError('Recurrence rule ID is required', 400, 'MISSING_ID');
      }

      const includePast = req.query.includePast === 'true';
      const limit = parseInt(toString(req.query.limit as string | string[] | undefined), 10) || 50;

      const events = await this.recurrenceService.getEventsByRuleId(userId, id, {
        includesPast: includePast,
        limit,
      });

      successResponse(res, events);
    } catch (error) {
      next(error);
    }
  };
  
  // POST /api/recurrence-rules/:id/exceptions - Add an exception (exclude a date)
  addException = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const id = toString(req.params.id);
      const { date } = req.body as { date: string };

      if (!id || !date) {
        throw createError('Recurrence rule ID and date are required', 400, 'MISSING_FIELDS');
      }

      const success = await this.recurrenceService.addException(userId, id, new Date(date));

      if (!success) {
        throw createError('Failed to add exception or rule not found', 404, 'EXCEPTION_FAILED');
      }

      successResponse(res, { message: 'Exception added successfully' });
    } catch (error) {
      next(error);
    }
  };

  // POST /api/recurrence-rules/generate-all - Generate events for all active rules (for cron job)
  // This endpoint is protected by requireInternalApiKey middleware in routes
  generateAllEvents = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await this.recurrenceService.generateEventsForAllActiveRules();

      successResponse(res, result);
    } catch (error) {
      next(error);
    }
  };
}
