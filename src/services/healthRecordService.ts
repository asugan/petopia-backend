import { HydratedDocument, QueryFilter, Types, UpdateQuery } from 'mongoose';
import {
  EventModel,
  HealthRecordModel,
  type IEventDocument,
  type IHealthRecordDocument,
  PetModel,
} from '../models/mongoose';
import type { HealthRecordQueryParams } from '../types/api';
import { parseUTCDate } from '../lib/dateUtils';

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
  description?: string;
  date: Date;
  veterinarian?: string;
  clinic?: string;
  cost?: number;
  notes?: string;
  attachments?: string;
  treatmentPlan?: TreatmentPlanItem[];
  nextVisitDate?: Date;
}

export interface UpdateHealthRecordData {
  type?: string;
  title?: string;
  description?: string;
  date?: Date;
  veterinarian?: string;
  clinic?: string;
  cost?: number;
  notes?: string;
  attachments?: string;
  treatmentPlan?: TreatmentPlanItem[];
  nextVisitDate?: Date | null;
}

type EventSnapshot = Pick<
  IEventDocument,
  | 'petId'
  | 'title'
  | 'description'
  | 'type'
  | 'startTime'
  | 'endTime'
  | 'location'
  | 'notes'
  | 'reminder'
  | 'vaccineName'
  | 'vaccineManufacturer'
  | 'batchNumber'
  | 'medicationName'
  | 'dosage'
  | 'frequency'
>;

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
        whereClause.date.$gte = parseUTCDate(startDate);
      }
      if (endDate) {
        whereClause.date.$lte = parseUTCDate(endDate);
      }
    }

    const total = await HealthRecordModel.countDocuments(whereClause);

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

  async getHealthRecordById(
    userId: string,
    id: string
  ): Promise<HydratedDocument<IHealthRecordDocument> | null> {
    const record = await HealthRecordModel.findOne({ _id: id, userId }).exec();
    return record ?? null;
  }

  private async createNextVisitEvent(
    userId: string,
    petId: string | Types.ObjectId,
    healthRecordTitle: string,
    nextVisitDate: Date
  ): Promise<HydratedDocument<IEventDocument>> {
    const [createdEvent] = await EventModel.create([
      {
        userId,
        petId,
        type: 'vet_visit',
        title: `Next Visit: ${healthRecordTitle}`,
        startTime: nextVisitDate,
        reminder: true,
        description: `Follow-up for ${healthRecordTitle}`,
      },
    ]);

    if (!createdEvent) {
      throw new Error('Failed to create next visit event');
    }

    return createdEvent;
  }

  async createHealthRecord(
    userId: string,
    recordData: CreateHealthRecordData
  ): Promise<HydratedDocument<IHealthRecordDocument>> {
    const pet = await PetModel.findOne({ _id: recordData.petId, userId }).exec();

    if (!pet) {
      throw new Error('Pet not found');
    }

    const { nextVisitDate, ...healthRecordFields } = recordData;

    let createdEventId: Types.ObjectId | undefined;

    try {
      if (nextVisitDate) {
        const createdEvent = await this.createNextVisitEvent(
          userId,
          recordData.petId,
          recordData.title,
          nextVisitDate
        );
        createdEventId = createdEvent._id;
      }

      const [createdRecord] = await HealthRecordModel.create([
        {
          ...healthRecordFields,
          userId,
          ...(createdEventId ? { nextVisitEventId: createdEventId } : {}),
        },
      ]);

      if (!createdRecord) {
        throw new Error('Failed to create health record');
      }

      return createdRecord;
    } catch (error) {
      if (createdEventId) {
        await EventModel.findOneAndDelete({ _id: createdEventId, userId })
          .exec()
          .catch(() => undefined);
      }

      throw error;
    }
  }

  async updateHealthRecord(
    userId: string,
    id: string,
    updates: UpdateHealthRecordData
  ): Promise<HydratedDocument<IHealthRecordDocument> | null> {
    const existingRecord = await HealthRecordModel.findOne({ _id: id, userId }).exec();
    if (!existingRecord) {
      return null;
    }

    const { nextVisitDate, ...restUpdates } = updates;

    const updateQuery: UpdateQuery<IHealthRecordDocument> = removeUndefinedValues(
      restUpdates as Record<string, unknown>
    ) as UpdateQuery<IHealthRecordDocument>;

    const baseTitle = restUpdates.title ?? existingRecord.title;
    const eventTitle = `Next Visit: ${baseTitle}`;
    const eventDescription = `Follow-up for ${baseTitle}`;

    const linkedEventId = existingRecord.nextVisitEventId;

    if (nextVisitDate === null && linkedEventId) {
      const updatedRecord = await HealthRecordModel.findOneAndUpdate(
        { _id: id, userId },
        { ...updateQuery, $unset: { nextVisitEventId: 1 } },
        { new: true }
      ).exec();

      if (!updatedRecord) {
        return null;
      }

      try {
        await EventModel.findOneAndDelete({ _id: linkedEventId, userId }).exec();
      } catch (error) {
        await HealthRecordModel.findOneAndUpdate(
          { _id: id, userId },
          { nextVisitEventId: linkedEventId }
        )
          .exec()
          .catch(() => undefined);

        throw error;
      }

      return updatedRecord;
    }

    let createdEventId: Types.ObjectId | undefined;
    let rollbackEvent:
      | {
          eventId: Types.ObjectId;
          startTime: Date;
          title: string;
          description?: string;
        }
      | undefined;

    try {
      if (nextVisitDate) {
        if (linkedEventId) {
          const previousEvent = await EventModel.findOne({ _id: linkedEventId, userId }).exec();

          if (previousEvent) {
            rollbackEvent = {
              eventId: previousEvent._id,
              startTime: previousEvent.startTime,
              title: previousEvent.title,
              description: previousEvent.description,
            };

            const updatedEvent = await EventModel.findOneAndUpdate(
              { _id: previousEvent._id, userId },
              {
                startTime: nextVisitDate,
                title: eventTitle,
                description: eventDescription,
              },
              { new: true }
            ).exec();

            if (!updatedEvent) {
              throw new Error('Failed to update next visit event');
            }
          } else {
            const newEvent = await this.createNextVisitEvent(
              userId,
              existingRecord.petId,
              baseTitle,
              nextVisitDate
            );
            createdEventId = newEvent._id;
            updateQuery.nextVisitEventId = newEvent._id;
          }
        } else {
          const newEvent = await this.createNextVisitEvent(
            userId,
            existingRecord.petId,
            baseTitle,
            nextVisitDate
          );
          createdEventId = newEvent._id;
          updateQuery.nextVisitEventId = newEvent._id;
        }
      } else if (restUpdates.title !== undefined && linkedEventId) {
        const previousEvent = await EventModel.findOne({ _id: linkedEventId, userId }).exec();

        if (previousEvent) {
          rollbackEvent = {
            eventId: previousEvent._id,
            startTime: previousEvent.startTime,
            title: previousEvent.title,
            description: previousEvent.description,
          };

          const updatedEvent = await EventModel.findOneAndUpdate(
            { _id: previousEvent._id, userId },
            {
              title: eventTitle,
              description: eventDescription,
            },
            { new: true }
          ).exec();

          if (!updatedEvent) {
            throw new Error('Failed to update next visit event');
          }
        }
      }

      const updatedRecord = await HealthRecordModel.findOneAndUpdate(
        { _id: id, userId },
        updateQuery,
        { new: true }
      ).exec();

      return updatedRecord ?? null;
    } catch (error) {
      if (createdEventId) {
        await EventModel.findOneAndDelete({ _id: createdEventId, userId })
          .exec()
          .catch(() => undefined);
      }

      if (rollbackEvent) {
        await EventModel.findOneAndUpdate(
          { _id: rollbackEvent.eventId, userId },
          {
            startTime: rollbackEvent.startTime,
            title: rollbackEvent.title,
            description: rollbackEvent.description,
          }
        )
          .exec()
          .catch(() => undefined);
      }

      throw error;
    }
  }

  async deleteHealthRecord(userId: string, id: string): Promise<boolean> {
    const existingRecord = await HealthRecordModel.findOne({ _id: id, userId }).exec();

    if (!existingRecord) {
      return false;
    }

    const linkedEventId = existingRecord.nextVisitEventId;

    let linkedEventSnapshot: EventSnapshot | undefined;

    if (linkedEventId) {
      const linkedEvent = await EventModel.findOne({ _id: linkedEventId, userId }).exec();

      if (linkedEvent) {
        linkedEventSnapshot = {
          petId: linkedEvent.petId,
          title: linkedEvent.title,
          description: linkedEvent.description,
          type: linkedEvent.type,
          startTime: linkedEvent.startTime,
          endTime: linkedEvent.endTime,
          location: linkedEvent.location,
          notes: linkedEvent.notes,
          reminder: linkedEvent.reminder,
          vaccineName: linkedEvent.vaccineName,
          vaccineManufacturer: linkedEvent.vaccineManufacturer,
          batchNumber: linkedEvent.batchNumber,
          medicationName: linkedEvent.medicationName,
          dosage: linkedEvent.dosage,
          frequency: linkedEvent.frequency,
        };
      }

      await EventModel.findOneAndDelete({ _id: linkedEventId, userId }).exec();
    }

    try {
      const deletedRecord = await HealthRecordModel.findOneAndDelete({ _id: id, userId }).exec();

      if (!deletedRecord) {
        if (linkedEventSnapshot) {
          const [restoredEvent] = await EventModel.create([
            {
              ...linkedEventSnapshot,
              userId,
            },
          ]);

          if (restoredEvent) {
            await HealthRecordModel.findOneAndUpdate(
              { _id: id, userId },
              { nextVisitEventId: restoredEvent._id }
            ).exec();
          }
        }

        return false;
      }

      return true;
    } catch (error) {
      if (linkedEventSnapshot) {
        const [restoredEvent] = await EventModel.create([
          {
            ...linkedEventSnapshot,
            userId,
          },
        ]);

        if (restoredEvent) {
          await HealthRecordModel.findOneAndUpdate(
            { _id: id, userId },
            { nextVisitEventId: restoredEvent._id }
          )
            .exec()
            .catch(() => undefined);
        }
      }

      throw error;
    }
  }
}
