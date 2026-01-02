import { AnyBulkWriteOperation } from 'mongodb';
import { HydratedDocument } from 'mongoose';
import {
  ExpenseModel,
  HealthRecordModel,
  IHealthRecordDocument,
  IUserSettingsDocument,
  UserBudgetModel,
  UserSettingsModel,
} from '../models/mongoose';
import { ExchangeRateService } from './exchangeRateService';
import { logger } from '../utils/logger';

interface UpdateUserSettingsInput {
  baseCurrency?: 'TRY' | 'USD' | 'EUR' | 'GBP';
  timezone?: string;
  language?: string;
  theme?: 'light' | 'dark';
  notificationsEnabled?: boolean;
  budgetNotificationsEnabled?: boolean;
  quietHoursEnabled?: boolean;
  quietHours?: {
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
  };
}

export class UserSettingsService {
  private exchangeRateService: ExchangeRateService;

  constructor() {
    this.exchangeRateService = new ExchangeRateService();
  }

  async getSettingsByUserId(userId: string): Promise<HydratedDocument<IUserSettingsDocument> | null> {
    const settings = await UserSettingsModel.findOne({ userId }).exec();
    if (settings) {
      return settings;
    }

    const defaultSettings = new UserSettingsModel({ userId });
    return await defaultSettings.save();
  }

  async updateSettings(
    userId: string,
    updates: UpdateUserSettingsInput
  ): Promise<HydratedDocument<IUserSettingsDocument>> {
    if (!updates || Object.keys(updates).length === 0) {
      throw new Error('No updates provided');
    }

    if (updates.baseCurrency && !['TRY', 'USD', 'EUR', 'GBP'].includes(updates.baseCurrency)) {
      throw new Error('Invalid baseCurrency. Must be one of: TRY, USD, EUR, GBP');
    }

    if (updates.theme && !['light', 'dark'].includes(updates.theme)) {
      throw new Error('Invalid theme. Must be light or dark');
    }

    if (updates.notificationsEnabled !== undefined && typeof updates.notificationsEnabled !== 'boolean') {
      throw new Error('Invalid notificationsEnabled. Must be boolean');
    }

    if (updates.budgetNotificationsEnabled !== undefined && typeof updates.budgetNotificationsEnabled !== 'boolean') {
      throw new Error('Invalid budgetNotificationsEnabled. Must be boolean');
    }

    if (updates.quietHoursEnabled !== undefined && typeof updates.quietHoursEnabled !== 'boolean') {
      throw new Error('Invalid quietHoursEnabled. Must be boolean');
    }

    if (updates.quietHours !== undefined) {
      this.validateQuietHours(updates.quietHours);
    }

    const existingSettings = await UserSettingsModel.findOne({ userId }).exec();
    if (!existingSettings) {
      const newSettings = new UserSettingsModel({ userId, ...updates });
      return await newSettings.save();
    }

    const updated = await UserSettingsModel.findOneAndUpdate(
      { userId },
      { ...updates },
      { new: true, runValidators: true }
    ).exec();

    if (!updated) {
      throw new Error('Failed to update user settings');
    }

    return updated;
  }

  async updateBaseCurrency(
    userId: string,
    baseCurrency: 'TRY' | 'USD' | 'EUR' | 'GBP'
  ): Promise<HydratedDocument<IUserSettingsDocument>> {
    if (!['TRY', 'USD', 'EUR', 'GBP'].includes(baseCurrency)) {
      throw new Error('Invalid baseCurrency. Must be one of: TRY, USD, EUR, GBP');
    }

    const existing = await UserSettingsModel.findOne({ userId }).exec();
    const previousBaseCurrency = existing?.baseCurrency ?? 'TRY';
    if (previousBaseCurrency === baseCurrency) {
      if (existing) {
        return existing;
      }
      const newSettings = new UserSettingsModel({ userId, baseCurrency });
      return await newSettings.save();
    }

    try {
      const expenseCount = await this.recalculateExpenseBaseCurrency(userId, baseCurrency);
      logger.info(`Updated ${expenseCount} expenses for user ${userId} to base currency ${baseCurrency}`);
      
      const healthRecordCount = await this.recalculateHealthRecordBaseCurrency(userId, baseCurrency);
      logger.info(`Updated ${healthRecordCount} health records for user ${userId} to base currency ${baseCurrency}`);
      
      await this.syncUserBudgetCurrency(userId, previousBaseCurrency, baseCurrency);
    } catch (error) {
      logger.error(`Failed to recalculate currencies for user ${userId}:`, error);
      throw error;
    }

    if (!existing) {
      const newSettings = new UserSettingsModel({ userId, baseCurrency });
      return await newSettings.save();
    }

    const updated = await UserSettingsModel.findOneAndUpdate(
      { userId },
      { baseCurrency },
      { new: true, runValidators: true }
    ).exec();

    if (!updated) {
      throw new Error('Failed to update baseCurrency');
    }

    return updated;
  }

  async getUserBaseCurrency(userId: string): Promise<'TRY' | 'USD' | 'EUR' | 'GBP'> {
    const settings = await UserSettingsModel.findOne({ userId }).exec();
    if (!settings) {
      return 'TRY';
    }
    return settings.baseCurrency;
  }

  private validateQuietHours(quietHours: UpdateUserSettingsInput['quietHours']): void {
    if (!quietHours) {
      throw new Error('quietHours is required');
    }

    const { startHour, startMinute, endHour, endMinute } = quietHours;
    const values = { startHour, startMinute, endHour, endMinute };

    for (const [key, value] of Object.entries(values)) {
      if (!Number.isInteger(value)) {
        throw new Error(`Invalid ${key}. Must be an integer`);
      }
    }

    if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) {
      throw new Error('Invalid quietHours hour. Must be between 0 and 23');
    }

    if (startMinute < 0 || startMinute > 59 || endMinute < 0 || endMinute > 59) {
      throw new Error('Invalid quietHours minute. Must be between 0 and 59');
    }
  }

  private async syncUserBudgetCurrency(
    userId: string,
    previousBaseCurrency: 'TRY' | 'USD' | 'EUR' | 'GBP',
    nextBaseCurrency: 'TRY' | 'USD' | 'EUR' | 'GBP'
  ): Promise<void> {
    const budget = await UserBudgetModel.findOne({ userId }).exec();
    if (!budget) {
      return;
    }

    const fromCurrency = (budget.currency as typeof previousBaseCurrency) ?? previousBaseCurrency;
    const amount = budget.amount ?? 0;

    if (fromCurrency === nextBaseCurrency) {
      budget.currency = nextBaseCurrency;
      await budget.save();
      return;
    }

    const rate = await this.exchangeRateService.getRate(fromCurrency, nextBaseCurrency);
    if (rate !== null) {
      budget.amount = this.round(amount * rate);
    }

    budget.currency = nextBaseCurrency;
    budget.lastAlertAt = undefined;
    budget.lastAlertSeverity = undefined;
    budget.lastAlertPeriod = undefined;
    budget.lastAlertPercentage = undefined;
    await budget.save();
  }

  private async recalculateExpenseBaseCurrency(
    userId: string,
    baseCurrency: 'TRY' | 'USD' | 'EUR' | 'GBP'
  ): Promise<number> {
    const expenses = await ExpenseModel.find({ userId })
      .select({ _id: 1, amount: 1, currency: 1 })
      .exec();

    if (expenses.length === 0) {
      return 0;
    }

    const currencies = new Set<string>();
    expenses.forEach(expense => {
      currencies.add(expense.currency ?? baseCurrency);
    });

    const rates = new Map<string, number>();
    for (const currency of currencies) {
      if (currency === baseCurrency) {
        rates.set(currency, 1);
        continue;
      }
      const rate = await this.exchangeRateService.getRate(currency, baseCurrency);
      if (rate === null) {
        throw new Error(`Exchange rate not available for ${currency} to ${baseCurrency}`);
      }
      rates.set(currency, rate);
    }

    const fxAsOf = new Date();
    const updates = expenses.map(expense => {
      const expenseCurrency = expense.currency ?? baseCurrency;
      const rate = rates.get(expenseCurrency);
      if (rate === undefined) {
        throw new Error(`Missing exchange rate for ${expenseCurrency} to ${baseCurrency}`);
      }
      const amount = expense.amount ?? 0;
      return {
        updateOne: {
          filter: { _id: expense._id },
          update: {
            $set: {
              currency: expenseCurrency,
              baseCurrency,
              amountBase: this.round(amount * rate),
              fxRate: rate,
              fxAsOf,
            },
          },
        },
      };
    });

    await ExpenseModel.bulkWrite(updates);
    return expenses.length;
  }

  private async recalculateHealthRecordBaseCurrency(
    userId: string,
    baseCurrency: 'TRY' | 'USD' | 'EUR' | 'GBP'
  ): Promise<number> {
    const healthRecords = await HealthRecordModel.find({ userId })
      .select({ _id: 1, cost: 1, currency: 1 })
      .exec();

    if (healthRecords.length === 0) {
      return 0;
    }

    const currencies = new Set<string>();
    healthRecords.forEach(record => {
      currencies.add(record.currency ?? baseCurrency);
    });

    const rates = new Map<string, number>();
    for (const currency of currencies) {
      if (currency === baseCurrency) {
        rates.set(currency, 1);
        continue;
      }
      const rate = await this.exchangeRateService.getRate(currency, baseCurrency);
      if (rate === null) {
        throw new Error(`Exchange rate not available for ${currency} to ${baseCurrency}`);
      }
      rates.set(currency, rate);
    }

    const fxAsOf = new Date();
    const updates: AnyBulkWriteOperation<IHealthRecordDocument>[] = healthRecords.map(record => {
      const recordCurrency = record.currency ?? baseCurrency;
      const rate = rates.get(recordCurrency);
      if (rate === undefined) {
        throw new Error(`Missing exchange rate for ${recordCurrency} to ${baseCurrency}`);
      }
      
      // If cost is missing/null, unset conversion fields (matching update behavior)
      if (record.cost == null) {
        return {
          updateOne: {
            filter: { _id: record._id },
            update: {
              $set: { currency: recordCurrency, baseCurrency },
              $unset: { amountBase: '', fxRate: '', fxAsOf: '' },
            },
          },
        };
      }
      
      return {
        updateOne: {
          filter: { _id: record._id },
          update: {
            $set: {
              currency: recordCurrency,
              baseCurrency,
              amountBase: this.round(record.cost * rate),
              fxRate: rate,
              fxAsOf,
            },
          },
        },
      };
    });

    await HealthRecordModel.bulkWrite(updates);
    return healthRecords.length;
  }

  private round(value: number, decimals = 2): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }
}
