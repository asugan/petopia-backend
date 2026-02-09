import { HydratedDocument, QueryFilter, Types } from 'mongoose';
import { formatInTimeZone } from 'date-fns-tz';
import { FeedingScheduleModel, IFeedingScheduleDocument, PetModel, UserSettingsModel } from '../models/mongoose';
import { CreateFeedingScheduleRequest, FeedingScheduleQueryParams, UpdateFeedingScheduleRequest } from '../types/api';
import { resolveEffectiveTimezone } from '../lib/timezone';

export class FeedingScheduleService {
  private dayNames = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ] as const;

  private async resolveUserTimezone(userId: string): Promise<string> {
    try {
      const settings = await UserSettingsModel.findOne({ userId: new Types.ObjectId(userId) })
        .select('timezone')
        .lean()
        .exec();
      return resolveEffectiveTimezone({ userTimezone: settings?.timezone });
    } catch {
      return resolveEffectiveTimezone({});
    }
  }

  private getDayNameInTimezone(date: Date, timezone: string): string {
    const dayIndex = Number(formatInTimeZone(date, timezone, 'i')) % 7;
    return this.dayNames[dayIndex] ?? 'sunday';
  }

  /**
   * Get feeding schedules for a user, optionally filtered by petId
   */
  async getFeedingSchedulesByPetId(
    userId: string,
    petId?: string,
    params?: FeedingScheduleQueryParams
  ): Promise<{ schedules: HydratedDocument<IFeedingScheduleDocument>[]; total: number }> {
    const { page = 1, limit = 10, isActive, foodType } = params ?? {};
    const offset = (page - 1) * limit;

    // Build where conditions - always filter by userId
    const whereClause: QueryFilter<IFeedingScheduleDocument> = { userId: new Types.ObjectId(userId) };

    // Only filter by petId if provided
    if (petId) {
      whereClause.petId = new Types.ObjectId(petId);
    }

    if (isActive !== undefined) {
      whereClause.isActive = isActive;
    }

    if (foodType) {
      whereClause.foodType = foodType;
    }

    // Get total count
    const total = await FeedingScheduleModel.countDocuments(whereClause);

    // Get schedules with pagination
    const schedules = await FeedingScheduleModel.find(whereClause)
      .sort({ time: 1 })
      .limit(limit)
      .skip(offset)
      .exec();

    return {
      schedules,
      total,
    };
  }

  /**
   * Get feeding schedule by ID, ensuring it belongs to the user
   */
  async getFeedingScheduleById(
    userId: string,
    id: string
  ): Promise<HydratedDocument<IFeedingScheduleDocument> | null> {
    const schedule = await FeedingScheduleModel.findOne({ _id: id, userId }).exec();
    return schedule ?? null;
  }

  /**
   * Create feeding schedule, ensuring the pet belongs to the user
   */
  async createFeedingSchedule(
    userId: string,
    scheduleData: CreateFeedingScheduleRequest
  ): Promise<HydratedDocument<IFeedingScheduleDocument>> {
    // Verify pet exists and belongs to user
    const pet = await PetModel.findOne({ _id: scheduleData.petId, userId }).exec();

    if (!pet) {
      throw new Error('Pet not found');
    }

    const newSchedule = new FeedingScheduleModel({ ...scheduleData, userId });
    const createdSchedule = await newSchedule.save();

    if (!createdSchedule) {
      throw new Error('Failed to create feeding schedule');
    }
    return createdSchedule;
  }

  /**
   * Update feeding schedule, ensuring it belongs to the user
   */
  async updateFeedingSchedule(
    userId: string,
    id: string,
    updates: UpdateFeedingScheduleRequest
  ): Promise<HydratedDocument<IFeedingScheduleDocument> | null> {
    // Don't allow updating userId
    const { ...safeUpdates } = updates;

    const updatedSchedule = await FeedingScheduleModel.findOneAndUpdate(
      { _id: id, userId },
      safeUpdates,
      { new: true }
    ).exec();

    return updatedSchedule ?? null;
  }

  /**
   * Delete feeding schedule, ensuring it belongs to the user
   */
  async deleteFeedingSchedule(userId: string, id: string): Promise<boolean> {
    const deletedSchedule = await FeedingScheduleModel.findOneAndDelete({ _id: id, userId }).exec();
    return !!deletedSchedule;
  }

  /**
   * Get active schedules for a user
   */
  async getActiveSchedules(
    userId: string,
    petId?: string
  ): Promise<HydratedDocument<IFeedingScheduleDocument>[]> {
    const whereClause: QueryFilter<IFeedingScheduleDocument> = {
      userId: new Types.ObjectId(userId),
      isActive: true
    };

    if (petId) {
      whereClause.petId = new Types.ObjectId(petId);
    }

    return await FeedingScheduleModel.find(whereClause)
      .sort({ time: 1 })
      .exec();
  }

  /**
   * Get today's schedules for a user
   */
  async getTodaySchedules(
    userId: string,
    petId?: string
  ): Promise<HydratedDocument<IFeedingScheduleDocument>[]> {
    const timezone = await this.resolveUserTimezone(userId);
    const todayName = this.getDayNameInTimezone(new Date(), timezone);

    const whereClause: QueryFilter<IFeedingScheduleDocument> = {
      userId: new Types.ObjectId(userId),
      isActive: true,
      days: { $regex: todayName, $options: 'i' }
    };

    if (petId) {
      whereClause.petId = new Types.ObjectId(petId);
    }

    return await FeedingScheduleModel.find(whereClause)
      .sort({ time: 1 })
      .exec();
  }

  /**
   * Get next feeding time for a user
   */
  async getNextFeedingTime(
    userId: string,
    petId?: string
  ): Promise<HydratedDocument<IFeedingScheduleDocument> | null> {
    const timezone = await this.resolveUserTimezone(userId);
    const todayName = this.getDayNameInTimezone(new Date(), timezone);

    const whereClause: QueryFilter<IFeedingScheduleDocument> = {
      userId: new Types.ObjectId(userId),
      isActive: true,
      days: { $regex: todayName, $options: 'i' }
    };

    if (petId) {
      whereClause.petId = new Types.ObjectId(petId);
    }

    const schedule = await FeedingScheduleModel.findOne(whereClause)
      .sort({ time: 1 })
      .exec();

    return schedule ?? null;
  }
}
