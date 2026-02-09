import { HydratedDocument, QueryFilter, Types, UpdateQuery } from 'mongoose';
import {
  HealthRecordModel,
  type IHealthRecordDocument,
  PetModel,
} from '../models/mongoose';
import type { HealthRecordQueryParams } from '../types/api';
import { parseUTCDate, parseUTCRangeEndDate } from '../lib/dateUtils';

export interface TreatmentPlanItem {
  name: string;
  dosage: string;
  frequency: string;
  duration?: string;
  notes?: string;
}

export interface CreateHealthRecordData {
  petId: string;
  type: string;
  title: string;
  date: Date;
  attachments?: string;
  treatmentPlan?: TreatmentPlanItem[];
}

export interface UpdateHealthRecordData {
  type?: string;
  title?: string;
  date?: Date;
  attachments?: string;
  treatmentPlan?: TreatmentPlanItem[];
}

const removeUndefinedValues = <T extends Record<string, unknown>>(obj: T): Partial<T> => {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
};

export class HealthRecordService {
  async getHealthRecordsByPetId(
    userId: string,
    petId?: string,
    params?: HealthRecordQueryParams
  ): Promise<{ records: HydratedDocument<IHealthRecordDocument>[]; total: number }> {
    const { page = 1, limit = 10, type, startDate, endDate } = params ?? {};
    const offset = (page - 1) * limit;

    const whereClause: QueryFilter<IHealthRecordDocument> = {
      userId: new Types.ObjectId(userId),
    };

    if (petId) {
      whereClause.petId = new Types.ObjectId(petId);
    }

    if (type) {
      whereClause.type = type;
    }

    if (startDate || endDate) {
      whereClause.date = {};
      if (startDate) {
        whereClause.date.$gte = parseUTCDate(startDate, 'healthRecordService.getHealthRecords.startDate');
      }
      if (endDate) {
        whereClause.date.$lte = parseUTCRangeEndDate(endDate);
      }
    }

    const total = await HealthRecordModel.countDocuments(whereClause);

    const records = await HealthRecordModel.find(whereClause)
      .sort({ date: -1 })
      .limit(limit)
      .skip(offset)
      .exec();

    return { records, total };
  }

  async getHealthRecordById(
    userId: string,
    id: string
  ): Promise<HydratedDocument<IHealthRecordDocument> | null> {
    const record = await HealthRecordModel.findOne({ _id: id, userId }).exec();
    return record ?? null;
  }

  async createHealthRecord(
    userId: string,
    recordData: CreateHealthRecordData
  ): Promise<HydratedDocument<IHealthRecordDocument>> {
    const pet = await PetModel.findOne({ _id: recordData.petId, userId }).exec();

    if (!pet) {
      throw new Error('Pet not found');
    }

    const [createdRecord] = await HealthRecordModel.create([
      {
        ...recordData,
        userId,
      },
    ]);

    if (!createdRecord) {
      throw new Error('Failed to create health record');
    }

    return createdRecord;
  }

  async updateHealthRecord(
    userId: string,
    id: string,
    updates: UpdateHealthRecordData
  ): Promise<HydratedDocument<IHealthRecordDocument> | null> {
    const updateQuery: UpdateQuery<IHealthRecordDocument> = removeUndefinedValues(
      updates as Record<string, unknown>
    ) as UpdateQuery<IHealthRecordDocument>;

    return await HealthRecordModel.findOneAndUpdate(
      { _id: id, userId },
      updateQuery,
      { new: true }
    ).exec();
  }

  async deleteHealthRecord(userId: string, id: string): Promise<boolean> {
    const deletedRecord = await HealthRecordModel.findOneAndDelete({ _id: id, userId }).exec();
    return !!deletedRecord;
  }
}
