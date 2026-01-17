import { NextFunction, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { PetService } from '../services/petService';
import { HealthRecordService } from '../services/healthRecordService';
import { successResponse } from '../utils/response';
import {
  CreatePetRequest,
  PetQueryParams,
  UpdatePetRequest,
} from '../types/api';
import { createError } from '../middleware/errorHandler';
import { parseUTCDate } from '../lib/dateUtils';
import { IPetDocument } from '../models/mongoose';
import { SubscriptionService } from '../services/subscriptionService';

export class PetController {
  private petService: PetService;
  private healthRecordService: HealthRecordService;
  private subscriptionService: SubscriptionService;

  constructor() {
    this.petService = new PetService();
    this.healthRecordService = new HealthRecordService();
    this.subscriptionService = new SubscriptionService();
  }

  // GET /api/pets - Get all pets for authenticated user
  getAllPets = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const params: PetQueryParams = {
        page: parseInt(req.query.page as string) ?? 1,
        limit: Math.min(parseInt(req.query.limit as string) ?? 10, 100),
        type: req.query.type as string,
        breed: req.query.breed as string,
        gender: req.query.gender as string,
      };

      const { pets, total } = await this.petService.getAllPets(userId, params);
      const page = params.page ?? 1;
      const limit = params.limit ?? 10;
      const meta = { total, page, limit, totalPages: Math.ceil(total / limit) };

      successResponse(res, pets, 200, meta);
    } catch (error) {
      next(error);
    }
  };

  // GET /api/pets/:id - Get pet by ID
  getPetById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const { id } = req.params;

      if (!id) {
        throw createError('Pet ID is required', 400, 'MISSING_ID');
      }

      const pet = await this.petService.getPetById(userId, id);

      if (!pet) {
        throw createError('Pet not found', 404, 'PET_NOT_FOUND');
      }

      successResponse(res, pet);
    } catch (error) {
      next(error);
    }
  };

  // POST /api/pets - Create new pet
  createPet = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const petData = req.body as CreatePetRequest;

      // Validation
      if (!petData.name || !petData.type) {
        throw createError(
          'Name and type are required',
          400,
          'MISSING_REQUIRED_FIELDS'
        );
      }

      const subscriptionStatus = await this.subscriptionService.getSubscriptionStatus(userId);
      if (!subscriptionStatus.hasActiveSubscription) {
        const { total } = await this.petService.getAllPets(userId, { page: 1, limit: 1 });
        if (total >= 1) {
          throw createError('Second pet requires Pro', 402, 'PRO_REQUIRED');
        }
      }

      // Convert string dates to UTC Date objects
      const convertedPetData: Partial<IPetDocument> = {
        ...petData,
        birthDate: petData.birthDate ? parseUTCDate(petData.birthDate) : undefined,
      };

      const pet = await this.petService.createPet(
        userId,
        convertedPetData
      );
      successResponse(res, pet, 201);
    } catch (error) {
      next(error);
    }
  };

  // PUT /api/pets/:id - Update pet
  updatePet = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const { id } = req.params;
      const updates = req.body as UpdatePetRequest;

      if (!id) {
        throw createError('Pet ID is required', 400, 'MISSING_ID');
      }

      // Convert string dates to UTC Date objects
      const convertedUpdates: Partial<IPetDocument> = {
        ...updates,
        birthDate: updates.birthDate !== undefined
          ? (updates.birthDate ? parseUTCDate(updates.birthDate) : null)
          : undefined,
      } as Partial<IPetDocument>;

      const pet = await this.petService.updatePet(
        userId,
        id,
        convertedUpdates
      );

      if (!pet) {
        throw createError('Pet not found', 404, 'PET_NOT_FOUND');
      }

      successResponse(res, pet);
    } catch (error) {
      next(error);
    }
  };

  // DELETE /api/pets/:id - Delete pet
  deletePet = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const { id } = req.params;

      if (!id) {
        throw createError('Pet ID is required', 400, 'MISSING_ID');
      }

      const deleted = await this.petService.deletePet(userId, id);

      if (!deleted) {
        throw createError('Pet not found', 404, 'PET_NOT_FOUND');
      }

      successResponse(res, { message: 'Pet deleted successfully' });
    } catch (error) {
      next(error);
    }
  };

  // POST /api/pets/:id/photo - Update pet photo
  updatePetPhoto = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const { id } = req.params;
      const { photoUrl } = req.body as { photoUrl: string };

      if (!id) {
        throw createError('Pet ID is required', 400, 'MISSING_ID');
      }

      if (!photoUrl) {
        throw createError('Photo URL is required', 400, 'MISSING_PHOTO_URL');
      }

      const pet = await this.petService.updatePetPhoto(userId, id, photoUrl);

      if (!pet) {
        throw createError('Pet not found', 404, 'PET_NOT_FOUND');
      }

      successResponse(res, pet);
    } catch (error) {
      next(error);
    }
  };

  // GET /api/pets/:id/health-records - Get pet's health records
  getPetHealthRecords = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const { id } = req.params;

      if (!id) {
        throw createError('Pet ID is required', 400, 'MISSING_ID');
      }

      // First verify the pet belongs to the user
      const pet = await this.petService.getPetById(userId, id);
      if (!pet) {
        throw createError('Pet not found', 404, 'PET_NOT_FOUND');
      }

      // Optional query parameters for filtering
      const params = {
        page: parseInt(req.query.page as string) ?? 1,
        limit: parseInt(req.query.limit as string) ?? 50,
        type: req.query.type as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
      };

      const healthRecords =
        await this.healthRecordService.getHealthRecordsByPetId(
          userId,
          id,
          params
        );

      successResponse(res, healthRecords.records);
    } catch (error) {
      next(error);
    }
  };
}
