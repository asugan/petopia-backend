import { HydratedDocument, Types } from 'mongoose';
import { ExpenseModel, IUserBudgetDocument, UserBudgetModel } from '../models/mongoose';
import { SetUserBudgetInput } from '../types/api';
import { UserSettingsService } from './userSettingsService';


// Budget status interface with pet breakdown
export interface BudgetStatus {
  budget: HydratedDocument<IUserBudgetDocument>;
  currentSpending: number;
  percentage: number;
  remainingAmount: number;
  isAlert: boolean;
  petBreakdown?: {
    petId: string;
    petName: string;
    spending: number;
  }[];
  monthOverMonth?: {
    current: number;
    previous: number;
    changePct: number;
  };
  categoryBreakdown?: {
    category: string;
    total: number;
    percentage: number;
  }[];
}

// Budget alert interface
export interface BudgetAlert {
  budget: HydratedDocument<IUserBudgetDocument>;
  currentSpending: number;
  percentage: number;
  isExceeded: boolean;
  remainingAmount: number;
  isAlert: boolean;
  petBreakdown?: {
    petId: string;
    petName: string;
    spending: number;
  }[];
  notificationPayload?: {
    title: string;
    body: string;
    severity: 'warning' | 'critical';
  };
}

interface MonthlyExpenseAggregate {
  petId: string;
  amount: number;
  description: string;
  date: Date;
  petName: string;
  category?: string;
}

export class UserBudgetService {
  private userSettingsService: UserSettingsService;

  constructor() {
    this.userSettingsService = new UserSettingsService();
  }

  /**
   * Get budget by userId (sadece bir record dönecek)
   */
  async getBudgetByUserId(userId: string): Promise<HydratedDocument<IUserBudgetDocument> | null> {
    const budget = await UserBudgetModel.findOne({ userId }).exec();
    return budget ?? null;
  }

  /**
   * Create/update budget (upsert pattern)
   */
  async setUserBudget(
    userId: string,
    data: SetUserBudgetInput
  ): Promise<HydratedDocument<IUserBudgetDocument>> {
    // Validate input
    if (!data.amount || data.amount <= 0) {
      throw new Error('Budget amount must be greater than 0');
    }

    const baseCurrency = await this.userSettingsService.getUserBaseCurrency(userId);

    // Check if budget already exists for this user
    const existingBudget = await this.getBudgetByUserId(userId);

    if (existingBudget) {
      const nextAlertThreshold = data.alertThreshold ?? existingBudget.alertThreshold ?? 0.8;
      const nextIsActive = data.isActive ?? existingBudget.isActive ?? true;
      const shouldResetAlerts =
        (data.alertThreshold !== undefined &&
          data.alertThreshold !== existingBudget.alertThreshold) ||
        (data.amount !== undefined && data.amount !== existingBudget.amount) ||
        (existingBudget.isActive === false && nextIsActive === true);

      // Update existing budget
      const updatedBudgetData = {
        amount: data.amount,
        currency: baseCurrency,
        alertThreshold: nextAlertThreshold,
        isActive: nextIsActive,
        lastAlertAt: shouldResetAlerts ? undefined : existingBudget.lastAlertAt,
        lastAlertSeverity: shouldResetAlerts ? undefined : existingBudget.lastAlertSeverity,
        lastAlertPeriod: shouldResetAlerts ? undefined : existingBudget.lastAlertPeriod,
        lastAlertPercentage: shouldResetAlerts ? undefined : existingBudget.lastAlertPercentage,
        updatedAt: new Date(),
      };

      const updatedBudget = await UserBudgetModel.findOneAndUpdate(
        { userId },
        updatedBudgetData,
        { new: true }
      ).exec();

      if (!updatedBudget) {
        throw new Error('Failed to update budget');
      }

      return updatedBudget;
    } else {
      // Create new budget
      const newBudget = new UserBudgetModel({
        userId,
        amount: data.amount,
        currency: baseCurrency,
        alertThreshold: data.alertThreshold ?? 0.8,
        isActive: data.isActive ?? true,
      });

      const createdBudget = await newBudget.save();

      if (!createdBudget) {
        throw new Error('Failed to create budget');
      }

      return createdBudget;
    }
  }

  /**
   * Delete user budget
   */
  async deleteUserBudget(userId: string): Promise<boolean> {
    const deletedBudget = await UserBudgetModel.findOneAndDelete({ userId }).exec();
    return !!deletedBudget;
  }

  /**
   * Simple budget status calculation (tüm petlerin harcamalarını içerir)
   */
  async getBudgetStatus(userId: string): Promise<BudgetStatus | null> {
    const budget = await this.getBudgetByUserId(userId);
    if (!budget?.isActive) {
      return null;
    }

    const baseCurrency = await this.userSettingsService.getUserBaseCurrency(userId);

    budget.currency = baseCurrency;

    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );
    const prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEndDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
      999
    );

    // Get all expenses for the user in current month (use amountBase for multi-currency support)
    const monthlyExpenses = await ExpenseModel.aggregate<MonthlyExpenseAggregate>([
      {
        $match: {
          userId: new Types.ObjectId(userId),
          baseCurrency,
          date: {
            $gte: startDate,
            $lte: endDate
          }
        }
      },
      {
        $lookup: {
          from: 'pets',
          localField: 'petId',
          foreignField: '_id',
          as: 'pet'
        }
      },
      { $unwind: '$pet' },
      {
        $project: {
          petId: '$petId',
          amount: '$amountBase',
          description: 1,
          date: 1,
          petName: '$pet.name',
          category: 1
        }
      }
    ]);

    const previousMonthExpenses = await ExpenseModel.aggregate<MonthlyExpenseAggregate>([
      {
        $match: {
          userId: new Types.ObjectId(userId),
          baseCurrency,
          date: {
            $gte: prevStartDate,
            $lte: prevEndDate
          }
        }
      },
      {
        $lookup: {
          from: 'pets',
          localField: 'petId',
          foreignField: '_id',
          as: 'pet'
        }
      },
      { $unwind: '$pet' },
      {
        $project: {
          petId: '$petId',
          amount: '$amountBase',
          description: 1,
          date: 1,
          petName: '$pet.name',
          category: 1
        }
      }
    ]);

    // Calculate total spending
    const currentSpending = monthlyExpenses.reduce(
      (sum: number, expense: MonthlyExpenseAggregate) => sum + expense.amount,
      0
    );

    const percentage =
      budget.amount > 0 ? (currentSpending / budget.amount) * 100 : 0;
    const remainingAmount = budget.amount - currentSpending;
    const isAlert = percentage >= budget.alertThreshold * 100;

    // Calculate pet breakdown
    const petBreakdown = monthlyExpenses.reduce(
      (acc: { petId: string; petName: string; spending: number }[], expense: MonthlyExpenseAggregate) => {
        const existing = acc.find(item => item.petId === expense.petId.toString()); // petId coming from project might be ObjectId or string depending on driver, assuming string here or casting
        if (existing) {
          existing.spending += expense.amount;
        } else {
          acc.push({
            petId: expense.petId.toString(),
            petName: expense.petName || 'Unknown Pet',
            spending: expense.amount,
          });
        }
        return acc;
      },
      []
    );

    const categoryTotals = monthlyExpenses.reduce(
      (acc: Record<string, number>, expense: MonthlyExpenseAggregate) => {
        const categoryKey = (expense as unknown as { category?: string }).category ?? 'other';
        acc[categoryKey] = (acc[categoryKey] ?? 0) + expense.amount;
        return acc;
      },
      {}
    );
    const categoryBreakdown =
      currentSpending > 0
        ? Object.entries(categoryTotals).map(([category, total]) => ({
            category,
            total,
            percentage: (total / currentSpending) * 100,
          }))
        : [];

    const prevTotal = previousMonthExpenses.reduce(
      (sum: number, expense: MonthlyExpenseAggregate) => sum + expense.amount,
      0
    );
    const changePct =
      prevTotal === 0 ? (currentSpending > 0 ? 100 : 0) : ((currentSpending - prevTotal) / prevTotal) * 100;

    return {
      budget,
      currentSpending,
      percentage,
      remainingAmount,
      isAlert,
      petBreakdown,
      monthOverMonth: {
        current: currentSpending,
        previous: prevTotal,
        changePct,
      },
      categoryBreakdown,
    };
  }

  /**
   * Simple alert check (tüm petler için)
   */
  async checkBudgetAlert(userId: string): Promise<BudgetAlert | null> {
    const settings = await this.userSettingsService.getSettingsByUserId(userId);
    if (!settings.notificationsEnabled || !settings.budgetNotificationsEnabled) {
      return null;
    }

    const budgetStatus = await this.getBudgetStatus(userId);

    if (!budgetStatus?.isAlert) {
      return null;
    }

    const now = new Date();
    const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const severity =
      budgetStatus.percentage >= 100 ? 'critical' : 'warning';

    const lastPeriod = budgetStatus.budget.lastAlertPeriod;
    const lastSeverity = budgetStatus.budget.lastAlertSeverity;
    if (lastPeriod === periodKey) {
      if (lastSeverity === 'critical') {
        return null;
      }
      if (lastSeverity === severity) {
        return null;
      }
    }

    const payloadBody =
      budgetStatus.percentage >= 100
        ? 'Budget limit exceeded. Review your expenses.'
        : 'You are nearing your budget limit. Consider adjusting spending.';

    budgetStatus.budget.lastAlertAt = now;
    budgetStatus.budget.lastAlertSeverity = severity;
    budgetStatus.budget.lastAlertPeriod = periodKey;
    budgetStatus.budget.lastAlertPercentage = budgetStatus.percentage;
    await budgetStatus.budget.save();

    return {
      budget: budgetStatus.budget,
      currentSpending: budgetStatus.currentSpending,
      percentage: budgetStatus.percentage,
      isExceeded: budgetStatus.percentage >= 100,
      remainingAmount: budgetStatus.remainingAmount,
      isAlert: true,
      petBreakdown: budgetStatus.petBreakdown,
      notificationPayload: {
        title: severity === 'critical' ? 'Budget exceeded' : 'Budget alert',
        body: payloadBody,
        severity,
      },
    };
  }

  /**
   * Get all active user budgets (for admin purposes)
   */
  async getActiveUserBudgets(): Promise<HydratedDocument<IUserBudgetDocument>[]> {
    return await UserBudgetModel.find({ isActive: true })
      .sort({ updatedAt: -1 })
      .exec();
  }

  /**
   * Get budget status for multiple users (batch operation)
   */
  async getBatchBudgetStatus(userIds: string[]): Promise<BudgetStatus[]> {
    const statuses: BudgetStatus[] = [];

    for (const userId of userIds) {
      const status = await this.getBudgetStatus(userId);
      if (status) {
        statuses.push(status);
      }
    }

    return statuses;
  }

  /**
   * Check budget alerts for multiple users (batch operation)
   */
  async getBatchBudgetAlerts(userIds: string[]): Promise<BudgetAlert[]> {
    const alerts: BudgetAlert[] = [];

    for (const userId of userIds) {
      const alert = await this.checkBudgetAlert(userId);
      if (alert) {
        alerts.push(alert);
      }
    }

    return alerts;
  }
}
