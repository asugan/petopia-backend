import { NextFunction, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { EventService } from '../services/eventService';
import { getPaginationParams, successResponse } from '../utils/response';
import {
  CreateEventRequest,
  EventQueryParams,
  UpdateEventRequest,
} from '../types/api';
import { createError } from '../middleware/errorHandler';
import { parseUTCDate } from '../lib/dateUtils';
import { IEventDocument } from '../models/mongoose';
import { toString } from '../utils/express-utils';

export class EventController {
  private eventService: EventService;

  constructor() {
    this.eventService = new EventService();
  }

  // GET /api/events OR /api/pets/:petId/events - Get events for authenticated user
  getEventsByPetId = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const petId = toString(req.params.petId) || toString(req.query.petId as string | string[] | undefined);
      const params: EventQueryParams = {
        ...getPaginationParams(req.query),
        type: toString(req.query.type as string | string[] | undefined),
        startDate: toString(req.query.startDate as string | string[] | undefined),
        endDate: toString(req.query.endDate as string | string[] | undefined),
      };

      const { events, total } = await this.eventService.getEventsByPetId(
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

      successResponse(res, events, 200, meta);
    } catch (error) {
      next(error);
    }
  };

  // GET /api/events/calendar/:date - Get events for a specific date
  getEventsByDate = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const date = toString(req.params.date);
      const params: EventQueryParams = {
        ...getPaginationParams(req.query),
        type: toString(req.query.type as string | string[] | undefined),
      };

      if (!date) {
        throw createError('Date is required', 400, 'MISSING_DATE');
      }

      const { events, total } = await this.eventService.getEventsByDate(
        userId,
        date,
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

      successResponse(res, events, 200, meta);
    } catch (error) {
      next(error);
    }
  };

  // GET /api/events/:id - Get event by ID
  getEventById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const id = toString(req.params.id);

      if (!id) {
        throw createError('Event ID is required', 400, 'MISSING_ID');
      }

      const event = await this.eventService.getEventById(userId, id);

      if (!event) {
        throw createError('Event not found', 404, 'EVENT_NOT_FOUND');
      }

      successResponse(res, event);
    } catch (error) {
      next(error);
    }
  };

  // POST /api/events - Create new event
  createEvent = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const eventData = req.body as CreateEventRequest;

      // Validation
      if (
        !eventData.petId ||
        !eventData.title ||
        !eventData.type ||
        !eventData.startTime
      ) {
        throw createError(
          'Pet ID, title, type, and start time are required',
          400,
          'MISSING_REQUIRED_FIELDS'
        );
      }

      // Convert string dates to UTC Date objects
      const convertedEventData = {
        ...eventData,
        startTime: parseUTCDate(eventData.startTime),
        endTime: eventData.endTime ? parseUTCDate(eventData.endTime) : undefined,
      };

      const event = await this.eventService.createEvent(
        userId,
        convertedEventData as unknown as Partial<IEventDocument>
      );
      successResponse(res, event, 201);
    } catch (error) {
      next(error);
    }
  };

  // PUT /api/events/:id - Update event
  updateEvent = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const id = toString(req.params.id);
      const updates = req.body as UpdateEventRequest;

      if (!id) {
        throw createError('Event ID is required', 400, 'MISSING_ID');
      }

      // Convert string dates to UTC Date objects
      const convertedUpdates: Partial<IEventDocument> = {
        ...updates,
        startTime: updates.startTime ? parseUTCDate(updates.startTime) : undefined,
        endTime: updates.endTime !== undefined
          ? (updates.endTime ? parseUTCDate(updates.endTime) : null)
          : undefined,
      } as Partial<IEventDocument>; // Cast needed for null vs undefined/optional

      const event = await this.eventService.updateEvent(
        userId,
        id,
        convertedUpdates
      );

      if (!event) {
        throw createError('Event not found', 404, 'EVENT_NOT_FOUND');
      }

      successResponse(res, event);
    } catch (error) {
      next(error);
    }
  };

  // DELETE /api/events/:id - Delete event
  deleteEvent = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const id = toString(req.params.id);

      if (!id) {
        throw createError('Event ID is required', 400, 'MISSING_ID');
      }

      const deleted = await this.eventService.deleteEvent(userId, id);

      if (!deleted) {
        throw createError('Event not found', 404, 'EVENT_NOT_FOUND');
      }

      successResponse(res, { message: 'Event deleted successfully' });
    } catch (error) {
      next(error);
    }
  };

  // GET /api/events/upcoming - Get upcoming events
  getUpcomingEvents = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const petId = req.query.petId as string;

      // Parse and validate days parameter
      const daysParam = req.query.days;
      let days = 7; // default

      if (daysParam !== undefined) {
        const parsedDays = parseInt(toString(daysParam as string | string[] | undefined));

        // Validate it's a number
        if (isNaN(parsedDays)) {
          throw createError(
            'Days parameter must be a valid number',
            400,
            'INVALID_DAYS_PARAM'
          );
        }

        // Validate range
        if (parsedDays < 1 || parsedDays > 365) {
          throw createError(
            'Days parameter must be between 1 and 365',
            400,
            'INVALID_DAYS_RANGE'
          );
        }

        days = parsedDays;
      }

      const events = await this.eventService.getUpcomingEvents(
        userId,
        petId,
        days
      );
      successResponse(res, events);
    } catch (error) {
      next(error);
    }
  };

  // GET /api/events/today - Get today's events
  getTodayEvents = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const petId = toString(req.query.petId as string | string[] | undefined);
      const events = await this.eventService.getTodayEvents(userId, petId);
      successResponse(res, events);
    } catch (error) {
      next(error);
    }
  };
}
