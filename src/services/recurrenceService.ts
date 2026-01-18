import { HydratedDocument, Types } from 'mongoose';
import { fromZonedTime } from 'date-fns-tz';
import {
  EventModel,
  IEventDocument,
  IRecurrenceRuleDocument,
  PetModel,
  RecurrenceRuleModel,
  UserSettingsModel,
} from '../models/mongoose';
import { logger } from '../utils/logger';
import {
  CreateRecurrenceRuleRequest,
  RecurrenceRuleQueryParams,
  UpdateRecurrenceRuleRequest,
} from '../types/api';
import { parseUTCDate } from '../lib/dateUtils';

// Default event time if user settings not available
const DEFAULT_EVENT_TIME = '09:00';

/**
 * Validates if a string is a valid IANA timezone identifier
 */
function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get horizon (days) for event generation based on frequency
 * More frequent = shorter horizon, less frequent = longer horizon
 */
function getHorizonForFrequency(
  frequency: string,
  interval = 1
): number {
  switch (frequency) {
    case 'times_per_day':
    case 'daily':
      return 90; // 3 months (max ~90 events for daily)
    case 'weekly':
      return 180; // 6 months (max ~26 events)
    case 'monthly':
      return 730; // 2 years (max ~24 events)
    case 'yearly':
      return 1825; // 5 years (max ~5 events)
    case 'custom':
      // Based on interval
      if (interval <= 3) return 90;
      if (interval <= 14) return 180;
      return 365;
    default:
      return 90;
  }
}

/**
 * Parse time string and apply to date in given timezone.
 * Uses date-fns-tz for proper DST handling.
 * @param baseDate - The base date (in UTC, only date part is used)
 * @param timeString - Time in HH:MM format
 * @param timezone - IANA timezone identifier
 * @returns UTC Date representing the specified local time
 */
function applyTimeToDateInTimezone(
  baseDate: Date,
  timeString: string,
  timezone: string
): Date {
  // Validate timezone
  if (!isValidTimezone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }

  // Parse time string
  const [hoursStr, minutesStr] = timeString.split(':');
  const hours = parseInt(hoursStr ?? '0', 10);
  const minutes = parseInt(minutesStr ?? '0', 10);

  // Validate parsed values
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid time format: ${timeString}. Expected HH:MM`);
  }

  // Get date components from baseDate (UTC)
  const year = baseDate.getUTCFullYear();
  const month = baseDate.getUTCMonth();
  const day = baseDate.getUTCDate();

  // Create a Date object representing the local time in the timezone
  // date-fns-tz's fromZonedTime converts a "local time in timezone" to UTC
  const localDateInTimezone = new Date(year, month, day, hours, minutes, 0, 0);
  
  return fromZonedTime(localDateInTimezone, timezone);
}

/**
 * Calculate all dates for a recurrence rule within horizon
 * @param rule - The recurrence rule
 * @param horizonDays - Number of days to look ahead
 * @param userDefaultTime - User's default event time from settings (HH:MM format)
 */
function calculateRecurrenceDates(
  rule: IRecurrenceRuleDocument,
  horizonDays: number,
  userDefaultTime: string = DEFAULT_EVENT_TIME
): Date[] {
  const dates: Date[] = [];
  const startDate = new Date(rule.startDate);
  const endDate = rule.endDate ? new Date(rule.endDate) : null;
  const horizonEnd = new Date();
  horizonEnd.setUTCDate(horizonEnd.getUTCDate() + horizonDays);

  // Determine the effective end date
  const effectiveEnd = endDate && endDate < horizonEnd ? endDate : horizonEnd;

  // Get excluded dates (normalized to minutes for comparison)
  const excludedTimes = (rule.excludedDates ?? []).map(d => {
    const date = new Date(d);
    date.setSeconds(0, 0);
    return date.getTime();
  });

  // Get times to generate for each day
  // Priority: rule.dailyTimes > userDefaultTime > DEFAULT_EVENT_TIME
  const times = rule.dailyTimes?.length
    ? rule.dailyTimes
    : [userDefaultTime];

  const currentDate = new Date(startDate);
  const interval = rule.interval ?? 1;

  // For weekly recurrence with interval > 1, we need to track week numbers
  const startWeekNumber = Math.floor(startDate.getTime() / (7 * 24 * 60 * 60 * 1000));

  while (currentDate <= effectiveEnd) {
    let shouldInclude = false;

    switch (rule.frequency) {
      case 'daily':
      case 'times_per_day':
        shouldInclude = true;
        break;

      case 'weekly': {
        // Calculate the current week number relative to start
        const currentWeekNumber = Math.floor(currentDate.getTime() / (7 * 24 * 60 * 60 * 1000));
        const weeksSinceStart = currentWeekNumber - startWeekNumber;
        
        // Only include if we're in the correct interval week
        if (weeksSinceStart >= 0 && weeksSinceStart % interval === 0) {
          if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
            const dayOfWeek = currentDate.getUTCDay();
            shouldInclude = rule.daysOfWeek.includes(dayOfWeek);
          } else {
            // Default to same day as start date
            shouldInclude = currentDate.getUTCDay() === startDate.getUTCDay();
          }
        }
        break;
      }

      case 'monthly': {
        const targetDay = rule.dayOfMonth ?? startDate.getUTCDate();
        const currentDay = currentDate.getUTCDate();
        
        // Check if this is the target day, or if target day doesn't exist in this month
        // (e.g., target is 31 but month has 30 days), use the last day
        const lastDayOfMonth = new Date(
          currentDate.getUTCFullYear(),
          currentDate.getUTCMonth() + 1,
          0
        ).getUTCDate();
        
        if (targetDay > lastDayOfMonth) {
          // Target day doesn't exist in this month, use last day
          shouldInclude = currentDay === lastDayOfMonth;
        } else {
          shouldInclude = currentDay === targetDay;
        }
        
        // Apply interval for monthly (every N months)
        if (shouldInclude && interval > 1) {
          const monthsSinceStart =
            (currentDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 +
            (currentDate.getUTCMonth() - startDate.getUTCMonth());
          if (monthsSinceStart % interval !== 0) {
            shouldInclude = false;
          }
        }
        break;
      }

      case 'yearly':
        shouldInclude =
          currentDate.getUTCMonth() === startDate.getUTCMonth() &&
          currentDate.getUTCDate() === startDate.getUTCDate();
        break;

      case 'custom': {
        // Every N days from start
        const diffDays = Math.floor(
          (currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        shouldInclude = diffDays % interval === 0;
        break;
      }
    }

    if (shouldInclude) {
      // For times_per_day or if dailyTimes specified, add multiple times
      if (rule.frequency === 'times_per_day' && rule.timesPerDay) {
        const timesToUse = times.slice(0, rule.timesPerDay);
        for (const time of timesToUse) {
          const eventDate = applyTimeToDateInTimezone(
            currentDate,
            time,
            rule.timezone
          );

          // Skip if this specific occurrence (date + time) is excluded
          const normalizedEventDate = new Date(eventDate);
          normalizedEventDate.setSeconds(0, 0);
          if (excludedTimes.includes(normalizedEventDate.getTime())) {
            continue;
          }

          if (eventDate >= new Date() && eventDate <= effectiveEnd) {
            dates.push(eventDate);
          }
        }
      } else {
        // Single time per day
        const time = times[0] ?? '09:00';
        const eventDate = applyTimeToDateInTimezone(
          currentDate,
          time,
          rule.timezone
        );

        // Skip if this specific occurrence (date + time) is excluded
        const normalizedEventDate = new Date(eventDate);
        normalizedEventDate.setSeconds(0, 0);
        if (!excludedTimes.includes(normalizedEventDate.getTime())) {
          if (eventDate >= new Date() && eventDate <= effectiveEnd) {
            dates.push(eventDate);
          }
        }
      }
    }

    // Move to next day
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }

  return dates;
}

export class RecurrenceService {
  /**
   * Get all recurrence rules for a user
   */
  async getRules(
    userId: string,
    params?: RecurrenceRuleQueryParams
  ): Promise<{
    rules: HydratedDocument<IRecurrenceRuleDocument>[];
    total: number;
  }> {
    const { page = 1, limit = 20, isActive, petId } = params ?? {};
    const offset = (page - 1) * limit;

    const whereClause: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
    };

    if (isActive !== undefined) {
      whereClause.isActive = isActive;
    }

    if (petId) {
      whereClause.petId = new Types.ObjectId(petId);
    }

    const total = await RecurrenceRuleModel.countDocuments(whereClause);

    const rules = await RecurrenceRuleModel.find(whereClause)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .exec();

    return { rules, total };
  }

  /**
   * Get a single recurrence rule by ID
   */
  async getRuleById(
    userId: string,
    id: string
  ): Promise<HydratedDocument<IRecurrenceRuleDocument> | null> {
    return RecurrenceRuleModel.findOne({
      _id: id,
      userId: new Types.ObjectId(userId),
    }).exec();
  }

  /**
   * Create a new recurrence rule and generate initial events
   */
  async createRule(
    userId: string,
    data: CreateRecurrenceRuleRequest
  ): Promise<{
    rule: HydratedDocument<IRecurrenceRuleDocument>;
    eventsCreated: number;
  }> {
    // Verify pet belongs to user
    const pet = await PetModel.findOne({
      _id: data.petId,
      userId: new Types.ObjectId(userId),
    }).exec();

    if (!pet) {
      throw new Error('Pet not found');
    }

    // Create the recurrence rule
    const rule = new RecurrenceRuleModel({
      userId: new Types.ObjectId(userId),
      petId: new Types.ObjectId(data.petId),
      title: data.title,
      description: data.description,
      type: data.type,
      location: data.location,
      notes: data.notes,
      reminder: data.reminder ?? false,
      reminderPreset: data.reminderPreset ?? 'standard',
      vaccineName: data.vaccineName,
      vaccineManufacturer: data.vaccineManufacturer,
      batchNumber: data.batchNumber,
      medicationName: data.medicationName,
      dosage: data.dosage,
      frequency: data.frequency,
      interval: data.interval ?? 1,
      daysOfWeek: data.daysOfWeek,
      dayOfMonth: data.dayOfMonth,
      timesPerDay: data.timesPerDay,
      dailyTimes: data.dailyTimes,
      eventDurationMinutes: data.eventDurationMinutes,
      timezone: data.timezone,
      startDate: parseUTCDate(data.startDate),
      endDate: data.endDate ? parseUTCDate(data.endDate) : undefined,
      isActive: true,
      lastGeneratedDate: new Date(),
    });

    await rule.save();

    // Generate initial events
    const eventsCreated = await this.generateEvents(
      userId,
      rule._id.toString()
    );

    return { rule, eventsCreated };
  }

  /**
   * Update a recurrence rule and sync changes to future events
   */
  async updateRule(
    userId: string,
    id: string,
    data: UpdateRecurrenceRuleRequest
  ): Promise<{
    rule: HydratedDocument<IRecurrenceRuleDocument> | null;
    eventsUpdated: number;
  }> {
    const rule = await RecurrenceRuleModel.findOne({
      _id: id,
      userId: new Types.ObjectId(userId),
    }).exec();

    if (!rule) {
      return { rule: null, eventsUpdated: 0 };
    }

    // Update rule fields
    if (data.title !== undefined) rule.title = data.title;
    if (data.description !== undefined) rule.description = data.description;
    if (data.type !== undefined) rule.type = data.type;
    if (data.location !== undefined) rule.location = data.location;
    if (data.notes !== undefined) rule.notes = data.notes;
    if (data.reminder !== undefined) rule.reminder = data.reminder;
    if (data.reminderPreset !== undefined)
      rule.reminderPreset = data.reminderPreset;
    if (data.vaccineName !== undefined) rule.vaccineName = data.vaccineName;
    if (data.vaccineManufacturer !== undefined)
      rule.vaccineManufacturer = data.vaccineManufacturer;
    if (data.batchNumber !== undefined) rule.batchNumber = data.batchNumber;
    if (data.medicationName !== undefined)
      rule.medicationName = data.medicationName;
    if (data.dosage !== undefined) rule.dosage = data.dosage;
    if (data.frequency !== undefined) rule.frequency = data.frequency;
    if (data.interval !== undefined) rule.interval = data.interval;
    if (data.daysOfWeek !== undefined) rule.daysOfWeek = data.daysOfWeek;
    if (data.dayOfMonth !== undefined) rule.dayOfMonth = data.dayOfMonth;
    if (data.timesPerDay !== undefined) rule.timesPerDay = data.timesPerDay;
    if (data.dailyTimes !== undefined) rule.dailyTimes = data.dailyTimes;
    if (data.eventDurationMinutes !== undefined)
      rule.eventDurationMinutes = data.eventDurationMinutes;
    if (data.timezone !== undefined) rule.timezone = data.timezone;
    if (data.startDate !== undefined)
      rule.startDate = parseUTCDate(data.startDate);
    if (data.endDate !== undefined)
      rule.endDate = data.endDate ? parseUTCDate(data.endDate) : undefined;
    if (data.isActive !== undefined) rule.isActive = data.isActive;

    await rule.save();

    // Sync changes to future events that are not exceptions
    const now = new Date();
    const updateResult = await EventModel.updateMany(
      {
        recurrenceRuleId: rule._id,
        userId: new Types.ObjectId(userId),
        startTime: { $gte: now },
        isException: { $ne: true },
        status: 'upcoming',
      },
      {
        $set: {
          title: rule.title,
          description: rule.description,
          type: rule.type,
          location: rule.location,
          notes: rule.notes,
          reminder: rule.reminder,
          reminderPreset: rule.reminderPreset,
          vaccineName: rule.vaccineName,
          vaccineManufacturer: rule.vaccineManufacturer,
          batchNumber: rule.batchNumber,
          medicationName: rule.medicationName,
          dosage: rule.dosage,
        },
      }
    );

    return { rule, eventsUpdated: updateResult.modifiedCount };
  }

  /**
   * Delete a recurrence rule and all its events
   */
  async deleteRule(
    userId: string,
    id: string
  ): Promise<{ deleted: boolean; eventsDeleted: number }> {
    const rule = await RecurrenceRuleModel.findOne({
      _id: id,
      userId: new Types.ObjectId(userId),
    }).exec();

    if (!rule) {
      return { deleted: false, eventsDeleted: 0 };
    }

    // Delete all associated events
    const deleteResult = await EventModel.deleteMany({
      recurrenceRuleId: rule._id,
      userId: new Types.ObjectId(userId),
    });

    // Delete the rule
    await RecurrenceRuleModel.deleteOne({ _id: rule._id });

    return { deleted: true, eventsDeleted: deleteResult.deletedCount };
  }

  /**
   * Generate events for a recurrence rule up to the horizon
   * Uses upsert to ensure idempotency
   * Fetches user's default event time from settings
   */
  async generateEvents(userId: string, ruleId: string): Promise<number> {
    const rule = await RecurrenceRuleModel.findOne({
      _id: ruleId,
      userId: new Types.ObjectId(userId),
      isActive: true,
    }).exec();

    if (!rule) {
      return 0;
    }

    // Get user's default event time from settings
    const userSettings = await UserSettingsModel.findOne({
      userId: new Types.ObjectId(userId),
    }).exec();
    const userDefaultTime = userSettings?.defaultEventTime ?? DEFAULT_EVENT_TIME;

    const horizonDays = getHorizonForFrequency(rule.frequency, rule.interval);
    const datesToGenerate = calculateRecurrenceDates(rule, horizonDays, userDefaultTime);

    let createdCount = 0;

    for (let i = 0; i < datesToGenerate.length; i++) {
      const date = datesToGenerate[i];
      if (!date) continue;

      try {
        // Calculate end time if duration is specified
        const endTime = rule.eventDurationMinutes
          ? new Date(date.getTime() + rule.eventDurationMinutes * 60 * 1000)
          : undefined;

        // Upsert pattern for idempotency
        const existingEvent = await EventModel.findOne({
          recurrenceRuleId: rule._id,
          startTime: date,
        }).exec();

        if (!existingEvent) {
          await EventModel.create({
            userId: rule.userId,
            petId: rule.petId,
            title: rule.title,
            description: rule.description,
            type: rule.type,
            startTime: date,
            endTime,
            location: rule.location,
            notes: rule.notes,
            reminder: rule.reminder,
            reminderPreset: rule.reminderPreset,
            status: 'upcoming',
            vaccineName: rule.vaccineName,
            vaccineManufacturer: rule.vaccineManufacturer,
            batchNumber: rule.batchNumber,
            medicationName: rule.medicationName,
            dosage: rule.dosage,
            recurrenceRuleId: rule._id,
            seriesIndex: i,
            isException: false,
          });
          createdCount++;
        }
      } catch (error: unknown) {
        // Handle duplicate key error (already exists)
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 11000
        ) {
          continue;
        }
        throw error;
      }
    }

    // Update last generated date
    await RecurrenceRuleModel.findByIdAndUpdate(ruleId, {
      lastGeneratedDate: new Date(),
    });

    return createdCount;
  }

  /**
   * Regenerate all events for a rule (delete future events and recreate)
   */
  async regenerateEvents(
    userId: string,
    ruleId: string
  ): Promise<{ deleted: number; created: number }> {
    const rule = await RecurrenceRuleModel.findOne({
      _id: ruleId,
      userId: new Types.ObjectId(userId),
    }).exec();

    if (!rule) {
      return { deleted: 0, created: 0 };
    }

    // Delete future non-exception events
    const now = new Date();
    const deleteResult = await EventModel.deleteMany({
      recurrenceRuleId: rule._id,
      userId: new Types.ObjectId(userId),
      startTime: { $gte: now },
      isException: { $ne: true },
    });

    // Generate new events
    const created = await this.generateEvents(userId, ruleId);

    return { deleted: deleteResult.deletedCount, created };
  }

  /**
   * Get events for a specific recurrence rule
   */
  async getEventsByRuleId(
    userId: string,
    ruleId: string,
    options?: { includesPast?: boolean; limit?: number }
  ): Promise<HydratedDocument<IEventDocument>[]> {
    const { includesPast = false, limit = 50 } = options ?? {};

    const whereClause: Record<string, unknown> = {
      recurrenceRuleId: new Types.ObjectId(ruleId),
      userId: new Types.ObjectId(userId),
    };

    if (!includesPast) {
      whereClause.startTime = { $gte: new Date() };
    }

    return EventModel.find(whereClause)
      .sort({ startTime: 1 })
      .limit(limit)
      .exec();
  }

  /**
   * Generate events for all active rules (for cron job)
   */
  async generateEventsForAllActiveRules(): Promise<{
    rulesProcessed: number;
    eventsCreated: number;
  }> {
    const activeRules = await RecurrenceRuleModel.find({ isActive: true });

    let rulesProcessed = 0;
    let eventsCreated = 0;

    for (const rule of activeRules) {
      try {
        const created = await this.generateEvents(
          rule.userId.toString(),
          rule._id.toString()
        );
        eventsCreated += created;
        rulesProcessed++;
      } catch (error) {
        logger.error(
          `Error generating events for rule ${rule._id.toString()}`,
          error
        );
      }
    }

    return { rulesProcessed, eventsCreated };
  }

  /**
   * Mark a specific occurrence as excluded
   */
  async addException(
    userId: string,
    ruleId: string,
    date: Date
  ): Promise<boolean> {
    // Normalize date to minutes
    const normalizedDate = new Date(date);
    normalizedDate.setSeconds(0, 0);

    const result = await RecurrenceRuleModel.updateOne(
      { _id: ruleId, userId: new Types.ObjectId(userId) },
      { $addToSet: { excludedDates: normalizedDate } }
    );

    if (result.modifiedCount > 0) {
      // Delete the existing event for this occurrence if it exists
      await EventModel.deleteOne({
        recurrenceRuleId: new Types.ObjectId(ruleId),
        userId: new Types.ObjectId(userId),
        startTime: normalizedDate,
      });
      return true;
    }

    return false;
  }
}
