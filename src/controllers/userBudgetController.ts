import { NextFunction, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { UserBudgetService } from '../services/userBudgetService';
import { SetUserBudgetInput } from '../types/api';
import { successResponse } from '../utils/response';
import { createError } from '../middleware/errorHandler';

export class UserBudgetController {
  private userBudgetService: UserBudgetService;

  constructor() {
    this.userBudgetService = new UserBudgetService();
  }

  // GET /api/budget - Get user budget
  getUserBudget = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);

      const budget = await this.userBudgetService.getBudgetByUserId(userId);

      // Return 200 with null data instead of 404 error when no budget exists
      successResponse(res, budget); // budget can be null
    } catch (error) {
      next(error);
    }
  };

  // PUT /api/budget - Set/update user budget
  setUserBudget = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const budgetData = req.body as SetUserBudgetInput;

      // Validation
      if (!budgetData.amount || budgetData.amount <= 0) {
        throw createError(
          'Budget amount must be greater than 0',
          400,
          'INVALID_AMOUNT'
        );
      }

      if (!budgetData.currency || budgetData.currency.trim() === '') {
        throw createError('Currency is required', 400, 'MISSING_CURRENCY');
      }

      if (
        budgetData.alertThreshold !== undefined &&
        (budgetData.alertThreshold < 0 || budgetData.alertThreshold > 1)
      ) {
        throw createError(
          'Alert threshold must be between 0 and 1',
          400,
          'INVALID_ALERT_THRESHOLD'
        );
      }

      const budget = await this.userBudgetService.setUserBudget(
        userId,
        budgetData
      );
      successResponse(res, budget, 201);
    } catch (error) {
      next(error);
    }
  };

  // DELETE /api/budget - Remove user budget
  deleteUserBudget = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);

      const deleted = await this.userBudgetService.deleteUserBudget(userId);

      // If no budget existed to delete, still return success (idempotent operation)
      // This aligns with the new pattern where "no budget" is not an error condition
      if (deleted) {
        successResponse(res, { message: 'Budget deleted successfully' });
      } else {
        successResponse(res, { message: 'No budget existed to delete' });
      }
    } catch (error) {
      next(error);
    }
  };

  // GET /api/budget/status - Get budget status with pet breakdown
  getBudgetStatus = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);

      const status = await this.userBudgetService.getBudgetStatus(userId);

      // Return 200 with null data instead of 404 error when no budget status exists
      successResponse(res, status); // status can be null
    } catch (error) {
      next(error);
    }
  };

  // GET /api/budget/alerts - Read-only budget alert preview
  checkBudgetAlerts = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);

      const alert = await this.userBudgetService.checkBudgetAlert(userId);

      successResponse(res, alert); // can be null
    } catch (error) {
      next(error);
    }
  };

  // POST /api/budget/alerts/ack - Acknowledge/dispatched budget alert
  acknowledgeBudgetAlert = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const { severity, percentage } = req.body as {
        severity?: 'warning' | 'critical';
        percentage?: number;
      };

      if (!severity || (severity !== 'warning' && severity !== 'critical')) {
        throw createError('severity must be warning or critical', 400, 'INVALID_SEVERITY');
      }

      if (typeof percentage !== 'number' || !Number.isFinite(percentage)) {
        throw createError('percentage must be a valid number', 400, 'INVALID_PERCENTAGE');
      }

      const ackResult = await this.userBudgetService.acknowledgeBudgetAlert(
        userId,
        severity,
        percentage
      );

      successResponse(res, ackResult);
    } catch (error) {
      next(error);
    }
  };
}
