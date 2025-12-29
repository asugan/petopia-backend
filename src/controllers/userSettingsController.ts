import { NextFunction, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { UserSettingsService } from '../services/userSettingsService';
import { UpdateBaseCurrencyRequest, UpdateUserSettingsRequest } from '../types/api';
import { successResponse } from '../utils/response';
import { createError } from '../middleware/errorHandler';

export class UserSettingsController {
  private userSettingsService: UserSettingsService;

  constructor() {
    this.userSettingsService = new UserSettingsService();
  }

  getUserSettings = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const settings = await this.userSettingsService.getSettingsByUserId(userId);
      successResponse(res, settings);
    } catch (error) {
      next(error);
    }
  };

  updateUserSettings = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const updates = req.body as UpdateUserSettingsRequest;

      if (!updates || Object.keys(updates).length === 0) {
        throw createError('No updates provided', 400, 'NO_UPDATES');
      }

      const settings = await this.userSettingsService.updateSettings(userId, updates);
      successResponse(res, settings);
    } catch (error) {
      next(error);
    }
  };

  updateBaseCurrency = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const { baseCurrency } = req.body as UpdateBaseCurrencyRequest;

      if (!baseCurrency) {
        throw createError('baseCurrency is required', 400, 'MISSING_BASE_CURRENCY');
      }

      const settings = await this.userSettingsService.updateBaseCurrency(userId, baseCurrency);
      successResponse(res, settings);
    } catch (error) {
      next(error);
    }
  };
}
