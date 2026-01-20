import { QueryFilter, Types, UpdateQuery } from 'mongoose';
import {
  EventModel,
  ExpenseModel,
  FeedingNotificationModel,
  FeedingScheduleModel,
  HealthRecordModel,
  IPetDocument,
  PetModel,
  RecurrenceRuleModel,
  ScheduledNotificationModel,
} from '../models/mongoose';
import { Pet, PetQueryParams } from '../types/api';

export class PetService {
  /**
   * Get all pets for a specific user
   */
  async getAllPets(
    userId: string,
    params: PetQueryParams
  ): Promise<{ pets: Pet[]; total: number }> {
    const { page = 1, limit = 10, type, breed, gender } = params;
    const offset = (page - 1) * limit;

    // Build where conditions - always filter by userId
    const whereClause: QueryFilter<IPetDocument> = { userId: new Types.ObjectId(userId) };

    if (type) {
      whereClause.type = type;
    }

    if (breed) {
      whereClause.breed = { $regex: breed, $options: 'i' };
    }

    if (gender) {
      whereClause.gender = gender;
    }

    // Get total count
    const total = await PetModel.countDocuments(whereClause);

    // Get pets with pagination
    const petsList = await PetModel.find(whereClause)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .exec();

    return {
      pets: petsList,
      total,
    };
  }

  /**
   * Get a pet by ID, ensuring it belongs to the user
   */
  async getPetById(userId: string, id: string): Promise<Pet | null> {
    const pet = await PetModel.findOne({ _id: id, userId }).exec();
    return pet ?? null;
  }

  /**
   * Create a new pet for a user
   */
  async createPet(
    userId: string,
    petData: Partial<IPetDocument>
  ): Promise<Pet> {
    const newPet = new PetModel({ ...petData, userId });
    const createdPet = await newPet.save();

    if (!createdPet) {
      throw new Error('Failed to create pet');
    }
    return createdPet;
  }

  /**
   * Update a pet, ensuring it belongs to the user
   */
  async updatePet(
    userId: string,
    id: string,
    updates: UpdateQuery<IPetDocument>
  ): Promise<Pet | null> {
    // Don't allow updating userId
    const { ...safeUpdates } = updates;

    const updatedPet = await PetModel.findOneAndUpdate(
      { _id: id, userId },
      safeUpdates,
      { new: true }
    ).exec();

    return updatedPet ?? null;
  }

  /**
   * Delete a pet, ensuring it belongs to the user
   */
  async deletePet(userId: string, id: string): Promise<boolean> {
    const deletedPet = await PetModel.findOneAndDelete({ _id: id, userId }).exec();
    return !!deletedPet;
  }

  /**
   * Update pet photo, ensuring it belongs to the user
   */
  async updatePetPhoto(
    userId: string,
    id: string,
    photoUrl: string
  ): Promise<Pet | null> {
    const updatedPet = await PetModel.findOneAndUpdate(
      { _id: id, userId },
      { profilePhoto: photoUrl },
      { new: true }
    ).exec();

    return updatedPet ?? null;
  }

  /**
   * Delete all pets except the specified one (for freemium downgrade)
   * Also deletes all related data: health records, events, expenses, feeding schedules, etc.
   */
  async deleteAllPetsExcept(
    userId: string,
    keepPetId: string
  ): Promise<{ deletedPetCount: number }> {
    const userObjectId = new Types.ObjectId(userId);
    const keepPetObjectId = new Types.ObjectId(keepPetId);

    // Verify the pet to keep belongs to the user
    const keepPet = await PetModel.findOne({
      _id: keepPetObjectId,
      userId: userObjectId,
    }).exec();

    if (!keepPet) {
      throw new Error('Pet to keep not found or does not belong to user');
    }

    // Get all pet IDs to delete (all except the one to keep)
    const petsToDelete = await PetModel.find({
      userId: userObjectId,
      _id: { $ne: keepPetObjectId },
    }).select('_id').exec();

    const petIdsToDelete = petsToDelete.map((p) => p._id);

    if (petIdsToDelete.length === 0) {
      return { deletedPetCount: 0 };
    }

    // Delete all related data for these pets
    await Promise.all([
      HealthRecordModel.deleteMany({ petId: { $in: petIdsToDelete } }),
      EventModel.deleteMany({ petId: { $in: petIdsToDelete } }),
      ExpenseModel.deleteMany({ petId: { $in: petIdsToDelete } }),
      FeedingScheduleModel.deleteMany({ petId: { $in: petIdsToDelete } }),
      RecurrenceRuleModel.deleteMany({ petId: { $in: petIdsToDelete } }),
      ScheduledNotificationModel.deleteMany({ petId: { $in: petIdsToDelete } }),
      FeedingNotificationModel.deleteMany({ petId: { $in: petIdsToDelete } }),
    ]);

    // Delete the pets
    const deleteResult = await PetModel.deleteMany({
      _id: { $in: petIdsToDelete },
    });

    return { deletedPetCount: deleteResult.deletedCount };
  }
}
