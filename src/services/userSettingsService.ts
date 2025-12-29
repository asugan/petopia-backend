import { HydratedDocument } from 'mongoose';
import { ExpenseModel, IUserSettingsDocument, UserBudgetModel, UserSettingsModel } from '../models/mongoose';
import { ExchangeRateService } from './exchangeRateService';

interface UpdateUserSettingsInput {
  baseCurrency?: 'TRY' | 'USD' | 'EUR' | 'GBP';
  timezone?: string;
  language?: string;
  theme?: 'light' | 'dark';
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

    await this.recalculateExpenseBaseCurrency(userId, baseCurrency);
    await this.syncUserBudgetCurrency(userId, previousBaseCurrency, baseCurrency);

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
    await budget.save();
  }

  private async recalculateExpenseBaseCurrency(
    userId: string,
    baseCurrency: 'TRY' | 'USD' | 'EUR' | 'GBP'
  ): Promise<void> {
    const expenses = await ExpenseModel.find({ userId })
      .select({ _id: 1, amount: 1, currency: 1 })
      .exec();

    if (expenses.length === 0) {
      return;
    }

    const currencies = new Set<string>();
    expenses.forEach(expense => {
      currencies.add(expense.currency || baseCurrency);
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
      const expenseCurrency = expense.currency || baseCurrency;
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
  }

  private round(value: number, decimals = 2): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }
}
