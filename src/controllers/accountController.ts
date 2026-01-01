import { NextFunction, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { auth } from '../lib/auth';
import { fromNodeHeaders } from 'better-auth/node';
import { successResponse } from '../utils/response';
import { logger } from '../utils/logger';

export class AccountController {
  /**
   * DELETE /api/account
   * Delete the current user's account
   *
   * Note: Since emailAndPassword is disabled in better-auth config,
   * all users sign in via social providers and don't have passwords.
   * Password verification is skipped for social login users.
   */
  deleteAccount = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Get authenticated user ID
      const userId = requireAuth(req);

      // Log audit event: account deletion initiated
      logger.info('Account deletion initiated', {
        userId,
        ipAddress: req.ip ?? req.socket.remoteAddress,
        userAgent: req.get('user-agent'),
        timestamp: new Date().toISOString(),
      });

      // Delete all user data FIRST (cascade delete)
      // Using lazy imports to avoid circular dependencies
      const { PetModel } = await import('../models/mongoose/pet');
      const { UserSettingsModel } = await import('../models/mongoose/userSettings');
      const { SubscriptionModel } = await import('../models/mongoose/subscription');
      const { UserTrialRegistryModel } = await import('../models/mongoose/userTrialRegistry');
      const { DeviceTrialRegistryModel } = await import('../models/mongoose/deviceTrialRegistry');
      const { UserBudgetModel } = await import('../models/mongoose/userBudget');

      // Delete all user-related data in parallel
      // Note: Pets cascade to pet-related data via their pre('findOneAndDelete') hooks
      const deleteResults = await Promise.all([
        // User-specific documents
        PetModel.deleteMany({ userId }), // Cascades to: Expenses, HealthRecords, Events, FeedingSchedules, BudgetLimits
        UserSettingsModel.deleteOne({ userId }),
        SubscriptionModel.deleteMany({ userId }),
        UserTrialRegistryModel.deleteOne({ userId }),
        DeviceTrialRegistryModel.deleteMany({ userId }),
        UserBudgetModel.deleteOne({ userId }),
      ]);

      // Log what was deleted
      logger.info('User data deleted', {
        userId,
        deletedPets: deleteResults[0]?.deletedCount,
        deletedUserSettings: deleteResults[1]?.deletedCount,
        deletedSubscriptions: deleteResults[2]?.deletedCount,
        deletedUserTrialRegistry: deleteResults[3]?.deletedCount,
        deletedDeviceTrialRegistry: deleteResults[4]?.deletedCount,
        deletedUserBudget: deleteResults[5]?.deletedCount,
        timestamp: new Date().toISOString(),
      });

      // THEN delete from better-auth (user document in better-auth collections)
      await auth.api.deleteUser({
        headers: fromNodeHeaders(req.headers),
        body: {},
      });

      // Log audit event: account deletion successful
      logger.info('Account deleted successfully', {
        userId,
        timestamp: new Date().toISOString(),
      });

      successResponse(res, {
        success: true,
        message: 'Account deleted successfully',
      });
    } catch (error) {
      // Log failure
      logger.error('Account deletion failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.id,
        timestamp: new Date().toISOString(),
      });
      next(error);
    }
  };
}
