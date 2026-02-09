import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const controllerSpies = vi.hoisted(() => ({
  getUpcomingEvents: vi.fn((req: express.Request, res: express.Response) => {
    res.status(200).json({ success: true, data: [] });
  }),
  getTodayEvents: vi.fn((req: express.Request, res: express.Response) => {
    res.status(200).json({ success: true, data: [] });
  }),
  getEventsByDate: vi.fn((req: express.Request, res: express.Response) => {
    res.status(200).json({ success: true, data: [] });
  }),
  getEventsByPetId: vi.fn((req: express.Request, res: express.Response) => {
    res.status(200).json({ success: true, data: [] });
  }),
  getEventById: vi.fn((req: express.Request, res: express.Response) => {
    res.status(200).json({ success: true });
  }),
  createEvent: vi.fn((req: express.Request, res: express.Response) => {
    res.status(201).json({ success: true });
  }),
  updateEvent: vi.fn((req: express.Request, res: express.Response) => {
    res.status(200).json({ success: true });
  }),
  deleteEvent: vi.fn((req: express.Request, res: express.Response) => {
    res.status(200).json({ success: true });
  }),
}));

vi.mock('@/controllers/eventController', () => ({
  EventController: class {
    getUpcomingEvents = controllerSpies.getUpcomingEvents;
    getTodayEvents = controllerSpies.getTodayEvents;
    getEventsByDate = controllerSpies.getEventsByDate;
    getEventsByPetId = controllerSpies.getEventsByPetId;
    getEventById = controllerSpies.getEventById;
    createEvent = controllerSpies.createEvent;
    updateEvent = controllerSpies.updateEvent;
    deleteEvent = controllerSpies.deleteEvent;
  },
}));

vi.mock('@/utils/mongodb-validation', () => ({
  validateObjectId: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

import eventRoutes from '@/routes/eventRoutes';
import { errorHandler } from '@/middleware/errorHandler';

describe('eventRoutes timezone contract', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/events', eventRoutes);
  app.use(errorHandler);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid timezone query for today endpoint', async () => {
    const response = await request(app).get('/api/events/today?timezone=Invalid/Timezone');

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(controllerSpies.getTodayEvents).not.toHaveBeenCalled();
  });

  it('accepts X-Timezone header when query timezone is absent', async () => {
    const response = await request(app)
      .get('/api/events/today')
      .set('X-Timezone', 'Europe/Istanbul');

    expect(response.status).toBe(200);
    expect(controllerSpies.getTodayEvents).toHaveBeenCalledTimes(1);
  });

  it('accepts timezone query for upcoming endpoint', async () => {
    const response = await request(app).get('/api/events/upcoming?timezone=America/New_York');

    expect(response.status).toBe(200);
    expect(controllerSpies.getUpcomingEvents).toHaveBeenCalledTimes(1);
  });
});
