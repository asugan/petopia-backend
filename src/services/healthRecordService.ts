import { HydratedDocument, QueryFilter, Types, UpdateQuery } from 'mongoose';
import { HealthRecordModel, IHealthRecordDocument, PetModel, EventModel } from '../models/mongoose';
import { HealthRecordQueryParams } from '../types/api';
import { parseUTCDate } from '../lib/dateUtils';

export class HealthRecordService {
  /**
   * Get health records for a user, optionally filtered by petId
   */
  async getHealthRecordsByPetId(
    userId: string,
    petId?: string,
    params?: HealthRecordQueryParams
  ): Promise<{ records: HydratedDocument<IHealthRecordDocument>[]; total: number }> {
    const { page = 1, limit = 10, type, startDate, endDate } = params ?? {};
    const offset = (page - 1) * limit;

    // Build where conditions - always filter by userId
    const whereClause: QueryFilter<IHealthRecordDocument> = { userId: new Types.ObjectId(userId) };

    if (petId) {
      whereClause.petId = new Types.ObjectId(petId);
    }

    if (type) {
      whereClause.type = type;
    }

    if (startDate || endDate) {
      whereClause.date = {};
      if (startDate) {
        whereClause.date.$gte = parseUTCDate(startDate);
      }
      if (endDate) {
        whereClause.date.$lte = parseUTCDate(endDate);
      }
    }

    // Get total count
    const total = await HealthRecordModel.countDocuments(whereClause);

    // Get records with pagination
    const records = await HealthRecordModel.find(whereClause)
      .sort({ date: -1 })
      .limit(limit)
      .skip(offset)
      .exec();

    return {
      records,
      total,
    };
  }

  /**
   * Get health record by ID, ensuring it belongs to the user
   */
  async getHealthRecordById(
    userId: string,
    id: string
  ): Promise<HydratedDocument<IHealthRecordDocument> | null> {
    const record = await HealthRecordModel.findOne({ _id: id, userId }).exec();
    return record ?? null;
  }

  /**
   * Create health record, ensuring the pet belongs to the user
   */
  async createHealthRecord(
    userId: string,
    recordData: Partial<IHealthRecordDocument> & { nextVisitDate?: Date }
  ): Promise<HydratedDocument<IHealthRecordDocument>> {
    // Verify pet exists and belongs to user
    const pet = await PetModel.findOne({ _id: recordData.petId, userId }).exec();

    if (!pet) {
      throw new Error('Pet not found');
    }

    if (recordData.nextVisitDate) {
      const nextVisitEvent = new EventModel({
        userId,
        petId: recordData.petId,
        type: 'vet_visit',
        title: `Next Visit: ${recordData.title}`,
        startTime: recordData.nextVisitDate,
        reminder: true,
        description: `Follow-up for ${recordData.title}`,
      });
      
      const savedEvent = await nextVisitEvent.save();
      recordData.nextVisitEventId = savedEvent._id;
      
      delete recordData.nextVisitDate;
    }

    const newRecord = new HealthRecordModel({ ...recordData, userId });
    const createdRecord = await newRecord.save();

    if (!createdRecord) {
      throw new Error('Failed to create health record');
    }
    return createdRecord;
  }

  /**
   * Update health record, ensuring it belongs to the user
   */
  async updateHealthRecord(
    userId: string,
    id: string,
    updates: Partial<IHealthRecordDocument> & { nextVisitDate?: Date }
  ): Promise<HydratedDocument<IHealthRecordDocument> | null> {
    const { nextVisitDate, ...safeUpdates } = updates;

    const existingRecord = await HealthRecordModel.findOne({ _id: id, userId }).exec();
    if (!existingRecord) {
      return null;
    }

    if (nextVisitDate) {
      if (existingRecord.nextVisitEventId) {
        await EventModel.findOneAndUpdate(
          { _id: existingRecord.nextVisitEventId, userId },
          {
            startTime: nextVisitDate,
            title: `Next Visit: ${safeUpdates.title ?? existingRecord.title}`,
            description: `Follow-up for ${safeUpdates.title ?? existingRecord.title}`,
          },
          { new: true }
        ).exec();
      } else {
        const nextVisitEvent = new EventModel({
          userId,
          petId: existingRecord.petId,
          type: 'vet_visit',
          title: `Next Visit: ${safeUpdates.title ?? existingRecord.title}`,
          startTime: nextVisitDate,
          reminder: true,
          description: `Follow-up for ${safeUpdates.title ?? existingRecord.title}`,
        });

        const savedEvent = await nextVisitEvent.save();
        safeUpdates.nextVisitEventId = savedEvent._id;
      }
    }

    const updatedRecord = await HealthRecordModel.findOneAndUpdate(
      { _id: id, userId },
      safeUpdates,
      { new: true }
    ).exec();

    return updatedRecord ?? null;
  }

  /**
   * Delete health record, ensuring it belongs to the user
   */
  async deleteHealthRecord(userId: string, id: string): Promise<boolean> {
    const deletedRecord = await HealthRecordModel.findOneAndDelete({ _id: id, userId }).exec();
    return !!deletedRecord;
  }

  /**
   * Health records are historical, so no upcoming queries live here.
   */
}
