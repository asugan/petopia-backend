import { NextFunction, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/eventService', () => {
  return {
    EventService: class {
      getEventsByPetId = vi.fn();
      getEventsByDate = vi.fn();
      getEventById = vi.fn();
      createEvent = vi.fn();
      updateEvent = vi.fn();
      deleteEvent = vi.fn();
      getUpcomingEvents = vi.fn();
      getTodayEvents = vi.fn();
    },
  };
});

vi.mock('@/middleware/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/utils/response', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/response')>();

  return {
    ...actual,
    successResponse: vi.fn((res, data, statusCode = 200, meta) => {
      (res.status as MockFn).mockReturnValue(res)(statusCode);
      (res.json as MockFn).mockReturnValue(res)({
        success: true,
        data,
        ...(meta && { meta }),
      });
      return res;
    }),
  };
});

vi.mock('@/lib/dateUtils', () => ({
  parseUTCDate: vi.fn((dateStr) => new Date(dateStr)),
}));

import { EventController } from '@/controllers/eventController';
import { requireAuth } from '@/middleware/auth';
import { successResponse } from '@/utils/response';
import { parseUTCDate } from '@/lib/dateUtils';
import type { CreateEventRequest, UpdateEventRequest } from '@/types/api';

type MockFn = ReturnType<typeof vi.fn>;

const mockRequest = (overrides: Partial<Record<string, unknown>> = {}) =>
  ({
    params: {},
    query: {},
    body: {},
    ...overrides,
  }) as unknown;

const mockResponse = () => {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as Response;
};

describe('EventController', () => {
  const mockUserId = 'user-123';
  const mockPetId = 'pet-456';
  const mockEventId = 'event-789';
  let controller: EventController;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new EventController();
    mockNext = vi.fn() as NextFunction;
    (requireAuth as MockFn).mockReturnValue(mockUserId);
  });

  describe('getEventsByPetId', () => {
    it('should return events with pagination', async () => {
      const mockEvents = [
        {
          _id: mockEventId,
          petId: mockPetId,
          userId: mockUserId,
          title: 'Test Event',
        },
      ];

      (controller.eventService as any).getEventsByPetId = vi.fn().mockResolvedValue({
        events: mockEvents,
        total: 1,
      });

      const req = mockRequest({
        params: { petId: mockPetId },
      });
      const res = mockResponse();

      await controller.getEventsByPetId(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockEvents,
        })
      );
    });

    it('should handle empty petId', async () => {
      (controller.eventService as any).getEventsByPetId = vi.fn().mockResolvedValue({
        events: [],
        total: 0,
      });

      const req = mockRequest({});
      const res = mockResponse();

      await controller.getEventsByPetId(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should pass petId from query params when not in route params', async () => {
      (controller.eventService as any).getEventsByPetId = vi.fn().mockResolvedValue({
        events: [],
        total: 0,
      });

      const req = mockRequest({
        query: { petId: mockPetId },
      });
      const res = mockResponse();

      await controller.getEventsByPetId(req, res, mockNext);

      expect(controller.eventService.getEventsByPetId).toHaveBeenCalledWith(
        mockUserId,
        mockPetId,
        expect.any(Object)
      );
    });

    it('should pass type filter from query params', async () => {
      (controller.eventService as any).getEventsByPetId = vi.fn().mockResolvedValue({
        events: [],
        total: 0,
      });

      const req = mockRequest({
        params: { petId: mockPetId },
        query: { type: 'feeding' },
      });
      const res = mockResponse();

      await controller.getEventsByPetId(req, res, mockNext);

      expect(controller.eventService.getEventsByPetId).toHaveBeenCalledWith(
        mockUserId,
        mockPetId,
        expect.objectContaining({ type: 'feeding' })
      );
    });

    it('should pass startDate and endDate filters from query params', async () => {
      (controller.eventService as any).getEventsByPetId = vi.fn().mockResolvedValue({
        events: [],
        total: 0,
      });

      const req = mockRequest({
        params: { petId: mockPetId },
        query: {
          startDate: '2025-01-01',
          endDate: '2025-01-31',
        },
      });
      const res = mockResponse();

      await controller.getEventsByPetId(req, res, mockNext);

      expect(controller.eventService.getEventsByPetId).toHaveBeenCalledWith(
        mockUserId,
        mockPetId,
        expect.objectContaining({
          startDate: '2025-01-01',
          endDate: '2025-01-31',
        })
      );
    });

    it('should return correct pagination meta', async () => {
      (controller.eventService as any).getEventsByPetId = vi.fn().mockResolvedValue({
        events: [],
        total: 25,
      });

      const req = mockRequest({
        params: { petId: mockPetId },
        query: { page: '2', limit: '10' },
      });
      const res = mockResponse();

      await controller.getEventsByPetId(req, res, mockNext);

      expect(successResponse).toHaveBeenCalledWith(
        res,
        [],
        200,
        expect.objectContaining({
          total: 25,
          totalPages: 3,
        })
      );
    });

    it('should handle errors gracefully', async () => {
      (controller.eventService as any).getEventsByPetId = vi
        .fn()
        .mockRejectedValue(new Error('Database error'));

      const req = mockRequest();
      const res = mockResponse();

      await controller.getEventsByPetId(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('getEventsByDate', () => {
    it('should return events for a specific date', async () => {
      const mockDate = '2025-01-15';
      const mockEvents = [{ _id: mockEventId, userId: mockUserId }];

      (controller.eventService as any).getEventsByDate = vi.fn().mockResolvedValue({
        events: mockEvents,
        total: 1,
      });

      const req = mockRequest({
        params: { date: mockDate },
      });
      const res = mockResponse();

      await controller.getEventsByDate(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should throw error when date is missing', async () => {
      const req = mockRequest({
        params: { date: '' },
      });
      const res = mockResponse();

      await controller.getEventsByDate(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Date is required',
          statusCode: 400,
        })
      );
    });

    it('should throw error when date param is undefined', async () => {
      const req = mockRequest({
        params: {},
      });
      const res = mockResponse();

      await controller.getEventsByDate(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Date is required',
          statusCode: 400,
        })
      );
    });

    it('should pass timezone parameter to service', async () => {
      const mockDate = '2025-01-15';

      (controller.eventService as any).getEventsByDate = vi.fn().mockResolvedValue({
        events: [],
        total: 0,
      });

      const req = mockRequest({
        params: { date: mockDate },
        query: { timezone: 'Europe/Istanbul' },
      });
      const res = mockResponse();

      await controller.getEventsByDate(req, res, mockNext);

      expect(controller.eventService.getEventsByDate).toHaveBeenCalledWith(
        mockUserId,
        mockDate,
        expect.any(Object),
        'Europe/Istanbul'
      );
    });

    it('should pass type filter from query params', async () => {
      const mockDate = '2025-01-15';

      (controller.eventService as any).getEventsByDate = vi.fn().mockResolvedValue({
        events: [],
        total: 0,
      });

      const req = mockRequest({
        params: { date: mockDate },
        query: { type: 'visit' },
      });
      const res = mockResponse();

      await controller.getEventsByDate(req, res, mockNext);

      expect(controller.eventService.getEventsByDate).toHaveBeenCalledWith(
        mockUserId,
        mockDate,
        expect.objectContaining({ type: 'visit' }),
        '' // toString returns empty string for undefined timezone
      );
    });

    it('should handle timezone from validatedQuery with nullish coalescing', async () => {
      const mockDate = '2025-01-15';

      (controller.eventService as any).getEventsByDate = vi.fn().mockResolvedValue({
        events: [],
        total: 0,
      });

      const req = mockRequest({
        params: { date: mockDate },
        validatedQuery: { timezone: 'America/New_York' },
      });
      const res = mockResponse();

      await controller.getEventsByDate(req, res, mockNext);

      expect(controller.eventService.getEventsByDate).toHaveBeenCalledWith(
        mockUserId,
        mockDate,
        expect.any(Object),
        'America/New_York'
      );
    });
  });

  describe('getEventById', () => {
    it('should return event by ID', async () => {
      const mockEvent = {
        _id: mockEventId,
        userId: mockUserId,
        title: 'Test Event',
      };

      (controller.eventService as any).getEventById = vi.fn().mockResolvedValue(mockEvent);

      const req = mockRequest({
        params: { id: mockEventId },
      });
      const res = mockResponse();

      await controller.getEventById(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockEvent,
        })
      );
    });

    it('should throw 404 when event not found', async () => {
      (controller.eventService as any).getEventById = vi.fn().mockResolvedValue(null);

      const req = mockRequest({
        params: { id: mockEventId },
      });
      const res = mockResponse();

      await controller.getEventById(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Event not found',
          statusCode: 404,
        })
      );
    });

    it('should throw error when ID is missing', async () => {
      const req = mockRequest({ params: {} });
      const res = mockResponse();

      await controller.getEventById(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Event ID is required',
          statusCode: 400,
        })
      );
    });

    it('should throw error when ID is empty string', async () => {
      const req = mockRequest({ params: { id: '' } });
      const res = mockResponse();

      await controller.getEventById(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Event ID is required',
          statusCode: 400,
        })
      );
    });

    it('should handle service errors gracefully', async () => {
      (controller.eventService as any).getEventById = vi
        .fn()
        .mockRejectedValue(new Error('Database connection failed'));

      const req = mockRequest({
        params: { id: mockEventId },
      });
      const res = mockResponse();

      await controller.getEventById(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('createEvent', () => {
    it('should create a new event', async () => {
      const eventData: CreateEventRequest = {
        petId: mockPetId,
        title: 'New Event',
        type: 'visit',
        startTime: '2025-01-15T10:00:00.000Z',
      };

      const mockEvent = {
        _id: mockEventId,
        ...eventData,
        userId: mockUserId,
      };

      (controller.eventService as any).createEvent = vi.fn().mockResolvedValue(mockEvent);

      const req = mockRequest({
        body: eventData,
      });
      const res = mockResponse();

      await controller.createEvent(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockEvent,
        })
      );
    });

    it('should throw error when petId is missing', async () => {
      const eventData: Partial<CreateEventRequest> = {
        title: 'Event',
        type: 'visit',
        startTime: '2025-01-15T10:00:00.000Z',
      };

      const req = mockRequest({ body: eventData });
      const res = mockResponse();

      await controller.createEvent(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Pet ID, title, type, and start time are required',
          statusCode: 400,
        })
      );
    });

    it('should throw error when title is missing', async () => {
      const eventData: Partial<CreateEventRequest> = {
        petId: mockPetId,
        type: 'visit',
        startTime: '2025-01-15T10:00:00.000Z',
      };

      const req = mockRequest({ body: eventData });
      const res = mockResponse();

      await controller.createEvent(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Pet ID, title, type, and start time are required',
          statusCode: 400,
        })
      );
    });

    it('should throw error when type is missing', async () => {
      const eventData: Partial<CreateEventRequest> = {
        petId: mockPetId,
        title: 'Event',
        startTime: '2025-01-15T10:00:00.000Z',
      };

      const req = mockRequest({ body: eventData });
      const res = mockResponse();

      await controller.createEvent(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Pet ID, title, type, and start time are required',
          statusCode: 400,
        })
      );
    });

    it('should throw error when startTime is missing', async () => {
      const eventData: Partial<CreateEventRequest> = {
        petId: mockPetId,
        title: 'Event',
        type: 'visit',
      };

      const req = mockRequest({ body: eventData });
      const res = mockResponse();

      await controller.createEvent(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Pet ID, title, type, and start time are required',
          statusCode: 400,
        })
      );
    });

    it('should throw error when all required fields are missing', async () => {
      const req = mockRequest({ body: {} });
      const res = mockResponse();

      await controller.createEvent(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Pet ID, title, type, and start time are required',
          statusCode: 400,
        })
      );
    });

    it('should convert date strings to UTC Date objects', async () => {
      const eventData: CreateEventRequest = {
        petId: mockPetId,
        title: 'Event with Dates',
        type: 'feeding',
        startTime: '2025-01-15T10:00:00.000Z',
      };

      const mockEvent = {
        _id: mockEventId,
        ...eventData,
        userId: mockUserId,
      };

      (controller.eventService as any).createEvent = vi.fn().mockResolvedValue(mockEvent);

      const req = mockRequest({
        body: eventData,
      });
      const res = mockResponse();

      await controller.createEvent(req, res, mockNext);

      expect(parseUTCDate).toHaveBeenCalledWith('2025-01-15T10:00:00.000Z');
      expect(parseUTCDate).toHaveBeenCalledTimes(1);
    });

    it('should handle service errors gracefully', async () => {
      const eventData: CreateEventRequest = {
        petId: mockPetId,
        title: 'Event',
        type: 'visit',
        startTime: '2025-01-15T10:00:00.000Z',
      };

      (controller.eventService as any).createEvent = vi
        .fn()
        .mockRejectedValue(new Error('Database error'));

      const req = mockRequest({ body: eventData });
      const res = mockResponse();

      await controller.createEvent(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('updateEvent', () => {
    it('should update an event', async () => {
      const updates: UpdateEventRequest = {
        title: 'Updated Title',
      };

      const mockEvent = {
        _id: mockEventId,
        userId: mockUserId,
        title: 'Updated Title',
      };

      (controller.eventService as any).updateEvent = vi.fn().mockResolvedValue(mockEvent);

      const req = mockRequest({
        params: { id: mockEventId },
        body: updates,
      });
      const res = mockResponse();

      await controller.updateEvent(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should throw 404 when event not found', async () => {
      (controller.eventService as any).updateEvent = vi.fn().mockResolvedValue(null);

      const req = mockRequest({
        params: { id: mockEventId },
        body: { title: 'Updated' },
      });
      const res = mockResponse();

      await controller.updateEvent(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Event not found',
          statusCode: 404,
        })
      );
    });

    it('should throw error when ID is missing', async () => {
      const req = mockRequest({
        params: {},
        body: { title: 'Updated' },
      });
      const res = mockResponse();

      await controller.updateEvent(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Event ID is required',
          statusCode: 400,
        })
      );
    });

    it('should throw error when ID is empty string', async () => {
      const req = mockRequest({
        params: { id: '' },
        body: { title: 'Updated' },
      });
      const res = mockResponse();

      await controller.updateEvent(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Event ID is required',
          statusCode: 400,
        })
      );
    });

    it('should parse startTime to UTC Date object', async () => {
      const updates: UpdateEventRequest = {
        startTime: '2025-01-20T09:00:00.000Z',
      };

      const startTimeDate = new Date('2025-01-20T09:00:00.000Z');

      const mockEvent = {
        _id: mockEventId,
        userId: mockUserId,
        startTime: startTimeDate,
      };

      (controller.eventService as any).updateEvent = vi.fn().mockResolvedValue(mockEvent);

      const req = mockRequest({
        params: { id: mockEventId },
        body: updates,
      });
      const res = mockResponse();

      await controller.updateEvent(req, res, mockNext);

      expect(parseUTCDate).toHaveBeenCalledWith('2025-01-20T09:00:00.000Z');
      expect(parseUTCDate).toHaveBeenCalledTimes(1);
    });

    it('should handle update with only startTime', async () => {
      const updates: UpdateEventRequest = {
        startTime: '2025-01-20T09:00:00.000Z',
      };

      const mockEvent = {
        _id: mockEventId,
        userId: mockUserId,
        startTime: new Date('2025-01-20T09:00:00.000Z'),
      };

      (controller.eventService as any).updateEvent = vi.fn().mockResolvedValue(mockEvent);

      const req = mockRequest({
        params: { id: mockEventId },
        body: updates,
      });
      const res = mockResponse();

      await controller.updateEvent(req, res, mockNext);

      expect(parseUTCDate).toHaveBeenCalledWith('2025-01-20T09:00:00.000Z');
      expect(parseUTCDate).toHaveBeenCalledTimes(1);
    });

    it('should not parse dates when not provided in updates', async () => {
      const updates: UpdateEventRequest = {
        title: 'New Title',
      };

      const mockEvent = {
        _id: mockEventId,
        userId: mockUserId,
        title: 'New Title',
      };

      (controller.eventService as any).updateEvent = vi.fn().mockResolvedValue(mockEvent);

      const req = mockRequest({
        params: { id: mockEventId },
        body: updates,
      });
      const res = mockResponse();

      await controller.updateEvent(req, res, mockNext);

      expect(parseUTCDate).not.toHaveBeenCalled();
    });

    it('should handle service errors gracefully', async () => {
      (controller.eventService as any).updateEvent = vi
        .fn()
        .mockRejectedValue(new Error('Database error'));

      const req = mockRequest({
        params: { id: mockEventId },
        body: { title: 'Updated' },
      });
      const res = mockResponse();

      await controller.updateEvent(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('deleteEvent', () => {
    it('should delete an event', async () => {
      (controller.eventService as any).deleteEvent = vi.fn().mockResolvedValue(true);

      const req = mockRequest({
        params: { id: mockEventId },
      });
      const res = mockResponse();

      await controller.deleteEvent(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return success message on delete', async () => {
      (controller.eventService as any).deleteEvent = vi.fn().mockResolvedValue(true);

      const req = mockRequest({
        params: { id: mockEventId },
      });
      const res = mockResponse();

      await controller.deleteEvent(req, res, mockNext);

      expect(successResponse).toHaveBeenCalledWith(res, {
        message: 'Event deleted successfully',
      });
    });

    it('should throw 404 when event not found', async () => {
      (controller.eventService as any).deleteEvent = vi.fn().mockResolvedValue(false);

      const req = mockRequest({
        params: { id: mockEventId },
      });
      const res = mockResponse();

      await controller.deleteEvent(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Event not found',
          statusCode: 404,
        })
      );
    });

    it('should throw error when ID is missing', async () => {
      const req = mockRequest({ params: {} });
      const res = mockResponse();

      await controller.deleteEvent(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Event ID is required',
          statusCode: 400,
        })
      );
    });

    it('should throw error when ID is empty string', async () => {
      const req = mockRequest({ params: { id: '' } });
      const res = mockResponse();

      await controller.deleteEvent(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Event ID is required',
          statusCode: 400,
        })
      );
    });

    it('should handle service errors gracefully', async () => {
      (controller.eventService as any).deleteEvent = vi
        .fn()
        .mockRejectedValue(new Error('Database error'));

      const req = mockRequest({
        params: { id: mockEventId },
      });
      const res = mockResponse();

      await controller.deleteEvent(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('getUpcomingEvents', () => {
    it('should return upcoming events', async () => {
      const mockEvents = [{ _id: mockEventId, userId: mockUserId }];
      (controller.eventService as any).getUpcomingEvents = vi.fn().mockResolvedValue(mockEvents);

      const req = mockRequest({ query: {} });
      const res = mockResponse();

      await controller.getUpcomingEvents(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should filter by petId if provided', async () => {
      const mockEvents = [{ _id: mockEventId, petId: mockPetId, userId: mockUserId }];
      (controller.eventService as any).getUpcomingEvents = vi.fn().mockResolvedValue(mockEvents);

      const req = mockRequest({
        query: { petId: mockPetId },
      });
      const res = mockResponse();

      await controller.getUpcomingEvents(req, res, mockNext);

      expect(controller.eventService.getUpcomingEvents).toHaveBeenCalledWith(
        mockUserId,
        mockPetId,
        7
      );
    });

    it('should use default days value of 7', async () => {
      (controller.eventService as any).getUpcomingEvents = vi.fn().mockResolvedValue([]);

      const req = mockRequest({ query: {} });
      const res = mockResponse();

      await controller.getUpcomingEvents(req, res, mockNext);

      expect(controller.eventService.getUpcomingEvents).toHaveBeenCalledWith(
        mockUserId,
        undefined,
        7
      );
    });

    it('should use custom days value when provided', async () => {
      (controller.eventService as any).getUpcomingEvents = vi.fn().mockResolvedValue([]);

      const req = mockRequest({ query: { days: '30' } });
      const res = mockResponse();

      await controller.getUpcomingEvents(req, res, mockNext);

      expect(controller.eventService.getUpcomingEvents).toHaveBeenCalledWith(
        mockUserId,
        undefined,
        30
      );
    });

    it('should accept boundary value days = 1', async () => {
      (controller.eventService as any).getUpcomingEvents = vi.fn().mockResolvedValue([]);

      const req = mockRequest({ query: { days: '1' } });
      const res = mockResponse();

      await controller.getUpcomingEvents(req, res, mockNext);

      expect(controller.eventService.getUpcomingEvents).toHaveBeenCalledWith(
        mockUserId,
        undefined,
        1
      );
    });

    it('should accept boundary value days = 365', async () => {
      (controller.eventService as any).getUpcomingEvents = vi.fn().mockResolvedValue([]);

      const req = mockRequest({ query: { days: '365' } });
      const res = mockResponse();

      await controller.getUpcomingEvents(req, res, mockNext);

      expect(controller.eventService.getUpcomingEvents).toHaveBeenCalledWith(
        mockUserId,
        undefined,
        365
      );
    });

    it('should throw error for invalid days parameter (NaN)', async () => {
      const req = mockRequest({ query: { days: 'invalid' } });
      const res = mockResponse();

      await controller.getUpcomingEvents(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Days parameter must be a valid number',
          statusCode: 400,
        })
      );
    });

    it('should throw error for days out of range (less than 1)', async () => {
      const req = mockRequest({ query: { days: '0' } });
      const res = mockResponse();

      await controller.getUpcomingEvents(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Days parameter must be between 1 and 365',
          statusCode: 400,
        })
      );
    });

    it('should throw error for negative days', async () => {
      const req = mockRequest({ query: { days: '-5' } });
      const res = mockResponse();

      await controller.getUpcomingEvents(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Days parameter must be between 1 and 365',
          statusCode: 400,
        })
      );
    });

    it('should throw error for days out of range (greater than 365)', async () => {
      const req = mockRequest({ query: { days: '400' } });
      const res = mockResponse();

      await controller.getUpcomingEvents(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Days parameter must be between 1 and 365',
          statusCode: 400,
        })
      );
    });

    it('should throw error for days = 366 (boundary + 1)', async () => {
      const req = mockRequest({ query: { days: '366' } });
      const res = mockResponse();

      await controller.getUpcomingEvents(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Days parameter must be between 1 and 365',
          statusCode: 400,
        })
      );
    });

    it('should handle service errors gracefully', async () => {
      (controller.eventService as any).getUpcomingEvents = vi
        .fn()
        .mockRejectedValue(new Error('Database error'));

      const req = mockRequest({ query: {} });
      const res = mockResponse();

      await controller.getUpcomingEvents(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('getTodayEvents', () => {
    it("should return today's events", async () => {
      const mockEvents = [{ _id: mockEventId, userId: mockUserId }];
      (controller.eventService as any).getTodayEvents = vi.fn().mockResolvedValue(mockEvents);

      const req = mockRequest({ query: {} });
      const res = mockResponse();

      await controller.getTodayEvents(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should filter by petId if provided', async () => {
      const mockEvents = [{ _id: mockEventId, petId: mockPetId, userId: mockUserId }];
      (controller.eventService as any).getTodayEvents = vi.fn().mockResolvedValue(mockEvents);

      const req = mockRequest({
        query: { petId: mockPetId },
      });
      const res = mockResponse();

      await controller.getTodayEvents(req, res, mockNext);

      expect(controller.eventService.getTodayEvents).toHaveBeenCalledWith(mockUserId, mockPetId);
    });

    it('should handle empty string petId as undefined', async () => {
      (controller.eventService as any).getTodayEvents = vi.fn().mockResolvedValue([]);

      const req = mockRequest({
        query: { petId: '' },
      });
      const res = mockResponse();

      await controller.getTodayEvents(req, res, mockNext);

      expect(controller.eventService.getTodayEvents).toHaveBeenCalledWith(mockUserId, '');
    });

    it('should handle undefined petId', async () => {
      (controller.eventService as any).getTodayEvents = vi.fn().mockResolvedValue([]);

      const req = mockRequest({ query: {} });
      const res = mockResponse();

      await controller.getTodayEvents(req, res, mockNext);

      expect(controller.eventService.getTodayEvents).toHaveBeenCalledWith(mockUserId, '');
    });

    it('should handle service errors gracefully', async () => {
      (controller.eventService as any).getTodayEvents = vi
        .fn()
        .mockRejectedValue(new Error('Database error'));

      const req = mockRequest({ query: {} });
      const res = mockResponse();

      await controller.getTodayEvents(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('authentication', () => {
    it('should call requireAuth for all endpoints', async () => {
      const methods = [
        'getEventsByPetId',
        'getEventsByDate',
        'getEventById',
        'createEvent',
        'updateEvent',
        'deleteEvent',
        'getUpcomingEvents',
        'getTodayEvents',
      ] as const;

      for (const method of methods) {
        vi.clearAllMocks();
        (requireAuth as MockFn).mockReturnValue(mockUserId);

        // Setup mock to prevent errors
        if (method === 'getEventsByPetId' || method === 'getEventsByDate') {
          (controller.eventService as any)[method] = vi
            .fn()
            .mockResolvedValue({ events: [], total: 0 });
        } else if (method === 'getEventById' || method === 'createEvent' || method === 'updateEvent') {
          (controller.eventService as any)[method] = vi.fn().mockResolvedValue({});
        } else if (method === 'deleteEvent') {
          (controller.eventService as any)[method] = vi.fn().mockResolvedValue(true);
        } else {
          (controller.eventService as any)[method] = vi.fn().mockResolvedValue([]);
        }

        const req = mockRequest({
          params: { id: mockEventId, petId: mockPetId, date: '2025-01-15' },
          body: {
            petId: mockPetId,
            title: 'Test',
            type: 'visit',
            startTime: '2025-01-15T10:00:00.000Z',
          },
        });
        const res = mockResponse();
        const next = vi.fn() as NextFunction;

        await controller[method](req, res, next);

        expect(requireAuth).toHaveBeenCalled();
      }
    });

    it('should propagate auth errors to next', async () => {
      const authError = new Error('Unauthorized');
      (requireAuth as MockFn).mockImplementation(() => {
        throw authError;
      });

      const req = mockRequest({});
      const res = mockResponse();

      await controller.getEventsByPetId(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(authError);
    });
  });
});
