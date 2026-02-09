import { HydratedDocument, QueryFilter, Types, UpdateQuery } from 'mongoose';
import {
  EventModel,
  IEventDocument,
  PetModel,
  UserSettingsModel,
} from '../models/mongoose';
import { ScheduledNotificationModel } from '../models/mongoose/scheduledNotifications';
import { EventQueryParams } from '../types/api';
import {
  getUTCDateRangeForLocalDate,
  getUTCTodayBoundariesForTimeZone,
  getUTCUpcomingBoundariesForTimeZone,
  parseUTCDate,
} from '../lib/dateUtils';
import { resolveEffectiveTimezone } from '../lib/timezone';

export class EventService {
  /**
   * Get events for a user, optionally filtered by petId
   */
  async getEventsByPetId(
    userId: string,
    petId?: string,
    params?: EventQueryParams
  ): Promise<{ events: HydratedDocument<IEventDocument>[]; total: number }> {
    const { page = 1, limit = 10, type, startDate, endDate } = params ?? {};
    const offset = (page - 1) * limit;

    // Build where conditions - always filter by userId
    const whereClause: QueryFilter<IEventDocument> = {
      userId: new Types.ObjectId(userId),
    };

    if (petId) {
      whereClause.petId = new Types.ObjectId(petId);
    }

    if (type) {
      whereClause.type = type;
    }

    if (startDate || endDate) {
      whereClause.startTime = {};
      if (startDate) {
        whereClause.startTime.$gte = parseUTCDate(startDate);
      }
      if (endDate) {
        whereClause.startTime.$lte = parseUTCDate(endDate);
      }
    }

    // Get total count
    const total = await EventModel.countDocuments(whereClause);

    // Get events with pagination
    const eventsList = await EventModel.find(whereClause)
      .sort({ startTime: 1 })
      .limit(limit)
      .skip(offset)
      .exec();

    return {
      events: eventsList,
      total,
    };
  }

  /**
   * Get events for a specific date for a user
   */
  async getEventsByDate(
    userId: string,
    date: string,
    params: EventQueryParams,
    clientTimezone?: string
  ): Promise<{ events: HydratedDocument<IEventDocument>[]; total: number }> {
    const { page = 1, limit = 10, type } = params;
    const offset = (page - 1) * limit;

    const settings = await UserSettingsModel.findOne({ userId })
      .select({ timezone: 1 })
      .lean()
      .exec();

    // Fix: Handle empty string timezone by checking if it's truthy after trimming
    const effectiveTimezone = resolveEffectiveTimezone({
      clientTimezone,
      userTimezone: settings?.timezone,
    });

    const { start, end } = getUTCDateRangeForLocalDate(date, effectiveTimezone);

    const whereClause: QueryFilter<IEventDocument> = {
      userId: new Types.ObjectId(userId),
      startTime: {
        $gte: start,
        $lt: end,
      },
    };

    if (type) {
      whereClause.type = type;
    }

    // Get total count
    const total = await EventModel.countDocuments(whereClause);

    // Get events with pagination
    const eventsList = await EventModel.find(whereClause)
      .sort({ startTime: 1 })
      .limit(limit)
      .skip(offset)
      .exec();

    return {
      events: eventsList,
      total,
    };
  }

  /**
   * Get event by ID, ensuring it belongs to the user
   */
  async getEventById(
    userId: string,
    id: string
  ): Promise<HydratedDocument<IEventDocument> | null> {
    const event = await EventModel.findOne({ _id: id, userId }).exec();
    return event ?? null;
  }

  /**
   * Create event, ensuring the pet belongs to the user
   */
  async createEvent(
    userId: string,
    eventData: Partial<IEventDocument>
  ): Promise<HydratedDocument<IEventDocument>> {
    // Verify pet exists and belongs to user
    const pet = await PetModel.findOne({ _id: eventData.petId, userId }).exec();

    if (!pet) {
      throw new Error('Pet not found');
    }

    const newEvent = new EventModel({ ...eventData, userId });
    const createdEvent = await newEvent.save();

    if (!createdEvent) {
      throw new Error('Failed to create event');
    }
    return createdEvent;
  }

  /**
   * Update event, ensuring it belongs to the user
   *
   * When startTime or reminder settings change, clears existing notification
   * records so that new reminders can be scheduled by the scheduler.
   */
  async updateEvent(
    userId: string,
    id: string,
    updates: UpdateQuery<IEventDocument>
  ): Promise<HydratedDocument<IEventDocument> | null> {
    // Don't allow updating userId
    const { ...safeUpdates } = updates;

    // Check if reminder-related fields are being updated
    const reminderFieldsChanged =
      'startTime' in updates ||
      'reminder' in updates ||
      'reminderPreset' in updates;

    // If reminder-related fields changed, clear notification records
    // This allows new reminders to be scheduled with updated times
    if (reminderFieldsChanged) {
      await ScheduledNotificationModel.deleteMany({
        eventId: new Types.ObjectId(id),
      });
    }

    const updatedEvent = await EventModel.findOneAndUpdate(
      { _id: id, userId },
      safeUpdates,
      { new: true }
    ).exec();

    return updatedEvent ?? null;
  }

  /**
   * Delete event, ensuring it belongs to the user
   * Also cleans up any scheduled notification records for this event.
   */
  async deleteEvent(userId: string, id: string): Promise<boolean> {
    const deletedEvent = await EventModel.findOneAndDelete({
      _id: id,
      userId,
    }).exec();

    if (deletedEvent) {
      // Clean up notification records for the deleted event
      await ScheduledNotificationModel.deleteMany({
        eventId: new Types.ObjectId(id),
      });
    }

    return !!deletedEvent;
  }

  /**
   * Get upcoming events for a user (UTC-based)
   * @param userId - User ID
   * @param petId - Optional pet ID to filter by
   * @param days - Number of days to look ahead (1-365, default: 7)
   * @returns Array of upcoming events
   */
  async getUpcomingEvents(
    userId: string,
    petId?: string,
    days = 7
  ): Promise<HydratedDocument<IEventDocument>[]> {
    // Parameter validation
    if (days < 1) {
      throw new Error('Days parameter must be at least 1');
    }
    if (days > 365) {
      throw new Error('Days parameter cannot exceed 365');
    }

    const settings = await UserSettingsModel.findOne({ userId })
      .select({ timezone: 1 })
      .lean()
      .exec();

    const boundaries = getUTCUpcomingBoundariesForTimeZone(
      days,
      resolveEffectiveTimezone({ userTimezone: settings?.timezone })
    );

    const whereClause: QueryFilter<IEventDocument> = {
      userId: new Types.ObjectId(userId),
      status: 'upcoming',
      startTime: {
        $gte: new Date(boundaries.gte),
        $lte: new Date(boundaries.lte),
      },
    };

    if (petId) {
      whereClause.petId = new Types.ObjectId(petId);
    }

    return await EventModel.find(whereClause).sort({ startTime: 1 }).exec();
  }

  /**
   * Get today's events for a user (UTC-based)
   */
  async getTodayEvents(
    userId: string,
    petId?: string
  ): Promise<HydratedDocument<IEventDocument>[]> {
    const settings = await UserSettingsModel.findOne({ userId })
      .select({ timezone: 1 })
      .lean()
      .exec();
    const todayBoundary = getUTCTodayBoundariesForTimeZone(
      resolveEffectiveTimezone({ userTimezone: settings?.timezone })
    );

    const whereClause: QueryFilter<IEventDocument> = {
      userId: new Types.ObjectId(userId),
      startTime: {
        $gte: new Date(todayBoundary.gte),
        $lte: new Date(todayBoundary.lte),
      },
    };

    if (petId) {
      whereClause.petId = new Types.ObjectId(petId);
    }

    return await EventModel.find(whereClause).sort({ startTime: 1 }).exec();
  }
}
