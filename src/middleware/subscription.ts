import { NextFunction, Response } from 'express';
import { SubscriptionService } from '../services/subscriptionService';
import { AuthenticatedRequest, requireAuth } from './auth';
import { createError } from './errorHandler';

const subscriptionService = new SubscriptionService();

/**
 * Require an active trial or paid subscription to access protected routes.
 */
export async function requireActiveSubscription(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = requireAuth(req);
    const status = await subscriptionService.getSubscriptionStatus(userId);

    if (!status.hasActiveSubscription) {
      throw createError(
        'Active subscription required',
        402,
        'SUBSCRIPTION_REQUIRED'
      );
    }

    next();
  } catch (error) {
    next(error);
  }
}
