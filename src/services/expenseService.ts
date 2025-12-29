import { HydratedDocument, UpdateQuery } from 'mongoose';
import { ExpenseModel, IExpenseDocument, PetModel } from '../models/mongoose';
import { ExpenseQueryParams } from '../types/api';
import { ExchangeRateService } from './exchangeRateService';
import { UserSettingsService } from './userSettingsService';
import PDFDocument from 'pdfkit';

const exchangeRateService = new ExchangeRateService();
const userSettingsService = new UserSettingsService();

interface ExpenseFilter {
  userId: string;
  petId?: string;
  category?: string;
  currency?: string;
  paymentMethod?: string;
  date?: { $gte?: Date; $lte?: Date };
  amount?: { $gte?: number; $lte?: number };
  baseCurrency?: string;
}

export class ExpenseService {
  async getExpensesByPetId(
    userId: string,
    petId?: string,
    params?: ExpenseQueryParams
  ): Promise<{ expenses: HydratedDocument<IExpenseDocument>[]; total: number }> {
    const {
      page = 1,
      limit = 10,
      category,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      currency,
      paymentMethod,
    } = params ?? {};
    const offset = (page - 1) * limit;

    const whereClause: ExpenseFilter = { userId };

    if (petId) {
      whereClause.petId = petId;
    }

    if (category) {
      whereClause.category = category;
    }

    if (currency) {
      whereClause.currency = currency;
    }

    if (paymentMethod) {
      whereClause.paymentMethod = paymentMethod;
    }

    if (startDate || endDate) {
      const dateQuery: { $gte?: Date; $lte?: Date } = {};
      whereClause.date = dateQuery;
      if (startDate) {
        dateQuery.$gte = new Date(startDate);
      }
      if (endDate) {
        dateQuery.$lte = new Date(endDate);
      }
    }

    if (minAmount !== undefined || maxAmount !== undefined) {
      const amountQuery: { $gte?: number; $lte?: number } = {};
      if (minAmount !== undefined) {
        amountQuery.$gte = minAmount;
      }
      if (maxAmount !== undefined) {
        amountQuery.$lte = maxAmount;
      }
      whereClause.amount = amountQuery;
    }

    const total = await ExpenseModel.countDocuments(whereClause);

    const expenseList = await ExpenseModel.find(whereClause)
      .sort({ date: -1 })
      .limit(limit)
      .skip(offset)
      .exec();

    return {
      expenses: expenseList,
      total,
    };
  }

  async getExpenseById(userId: string, id: string): Promise<HydratedDocument<IExpenseDocument> | null> {
    const expense = await ExpenseModel.findOne({ _id: id, userId }).exec();
    return expense ?? null;
  }

  async createExpense(
    userId: string,
    expenseData: Partial<IExpenseDocument>
  ): Promise<HydratedDocument<IExpenseDocument>> {
    const pet = await PetModel.findOne({ _id: expenseData.petId, userId }).exec();

    if (!pet) {
      throw new Error('Pet not found');
    }

    const baseCurrency = await userSettingsService.getUserBaseCurrency(userId);
    const expenseCurrency = expenseData.currency ?? baseCurrency;
    const expenseAmount = expenseData.amount ?? 0;
    expenseData.currency = expenseCurrency;

    if (expenseCurrency === baseCurrency) {
      expenseData.baseCurrency = baseCurrency;
      expenseData.amountBase = expenseAmount;
      expenseData.fxRate = 1;
      expenseData.fxAsOf = new Date();
    } else {
      const rate = await exchangeRateService.getRate(expenseCurrency, baseCurrency);
      
      if (rate === null) {
        throw new Error('Exchange rate not available for currency conversion');
      }

      expenseData.baseCurrency = baseCurrency;
      expenseData.amountBase = this.round(expenseAmount * rate);
      expenseData.fxRate = rate;
      expenseData.fxAsOf = new Date();
    }

    const newExpense = new ExpenseModel({ ...expenseData, userId });
    const createdExpense = await newExpense.save();

    if (!createdExpense) {
      throw new Error('Failed to create expense');
    }
    return createdExpense;
  }

  async updateExpense(
    userId: string,
    id: string,
    updates: Partial<IExpenseDocument>
  ): Promise<HydratedDocument<IExpenseDocument> | null> {
    const expense = await ExpenseModel.findOne({ _id: id, userId }).exec();
    
    if (!expense) {
      throw new Error('Expense not found');
    }

    const safeUpdates: Partial<IExpenseDocument> = { ...updates };
    delete safeUpdates.userId;

    if (updates.currency !== undefined || updates.amount !== undefined) {
      const baseCurrency = await userSettingsService.getUserBaseCurrency(userId);
      const expenseCurrency = updates.currency ?? expense.currency;
      const expenseAmount = updates.amount ?? expense.amount;

      if (expenseCurrency === baseCurrency) {
        safeUpdates.baseCurrency = baseCurrency;
        safeUpdates.amountBase = expenseAmount;
        safeUpdates.fxRate = 1;
        safeUpdates.fxAsOf = new Date();
      } else {
        const rate = await exchangeRateService.getRate(expenseCurrency, baseCurrency);
        
        if (rate === null) {
          throw new Error('Exchange rate not available for currency conversion');
        }

        safeUpdates.baseCurrency = baseCurrency;
        safeUpdates.amountBase = this.round(expenseAmount * rate);
        safeUpdates.fxRate = rate;
        safeUpdates.fxAsOf = new Date();
      }
    }

    const updatedExpense = await ExpenseModel.findOneAndUpdate(
      { _id: id, userId },
      safeUpdates as UpdateQuery<IExpenseDocument>,
      { new: true }
    ).exec();

    return updatedExpense ?? null;
  }

  async deleteExpense(userId: string, id: string): Promise<boolean> {
    const deletedExpense = await ExpenseModel.findOneAndDelete({ _id: id, userId }).exec();
    return !!deletedExpense;
  }

  async getExpensesByDateRange(
    userId: string,
    petId: string | undefined,
    startDate: Date,
    endDate: Date
  ): Promise<HydratedDocument<IExpenseDocument>[]> {
    return this.getExpensesByPetId(userId, petId, {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      page: 1,
      limit: 1000,
    }).then(result => result.expenses);
  }

  async getExpenseStats(
    userId: string,
    petId?: string,
    startDate?: Date,
    endDate?: Date,
    category?: string
  ): Promise<{
    total: number;
    count: number;
    average: number;
    byCategory: { category: string; total: number; count: number }[];
    byCurrency: { currency: string; total: number }[];
  }> {
    const baseCurrency = await userSettingsService.getUserBaseCurrency(userId);
    const whereClause: ExpenseFilter = { userId, baseCurrency };

    if (petId) {
      whereClause.petId = petId;
    }

    if (startDate || endDate) {
      const dateQuery: { $gte?: Date; $lte?: Date } = {};
      whereClause.date = dateQuery;
      if (startDate) {
        dateQuery.$gte = startDate;
      }
      if (endDate) {
        dateQuery.$lte = endDate;
      }
    }

    if (category) {
      whereClause.category = category;
    }

    const totalResultList = await ExpenseModel.aggregate([
      { $match: whereClause },
      {
        $group: {
          _id: null,
          total: { $sum: '$amountBase' },
          count: { $sum: 1 },
        },
      },
    ]) as unknown as { total: number; count: number }[];

    const totalResult = totalResultList[0];
    const total = totalResult?.total ?? 0;
    const expenseCount = totalResult?.count ?? 0;
    const average = expenseCount > 0 ? total / expenseCount : 0;

    const byCategory = await ExpenseModel.aggregate([
      { $match: whereClause },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amountBase' },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, category: '$_id', total: 1, count: 1 } },
    ]) as unknown as { category: string; total: number; count: number }[];

    const byCurrency = await ExpenseModel.aggregate([
      { $match: whereClause },
      {
        $group: {
          _id: '$currency',
          total: { $sum: '$amount' },
        },
      },
      { $project: { _id: 0, currency: '$_id', total: 1 } },
    ]) as unknown as { currency: string; total: number }[];

    return {
      total,
      count: expenseCount,
      average,
      byCategory,
      byCurrency,
    };
  }

  async getMonthlyExpenses(
    userId: string,
    petId?: string,
    year?: number,
    month?: number
  ): Promise<HydratedDocument<IExpenseDocument>[]> {
    const now = new Date();
    const targetYear = year ?? now.getFullYear();
    const targetMonth = month ?? now.getMonth();

    const startDate = new Date(targetYear, targetMonth, 1);
    const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

    return this.getExpensesByDateRange(userId, petId, startDate, endDate);
  }

  async getYearlyExpenses(
    userId: string,
    petId?: string,
    year?: number
  ): Promise<HydratedDocument<IExpenseDocument>[]> {
    const now = new Date();
    const targetYear = year ?? now.getFullYear();

    const startDate = new Date(targetYear, 0, 1);
    const endDate = new Date(targetYear, 11, 31, 23, 59, 59, 999);

    return this.getExpensesByDateRange(userId, petId, startDate, endDate);
  }

  async getExpensesByCategory(
    userId: string,
    category: string,
    petId?: string
  ): Promise<HydratedDocument<IExpenseDocument>[]> {
    return this.getExpensesByPetId(userId, petId, {
      category,
      page: 1,
      limit: 1000,
    }).then(result => result.expenses);
  }

  async exportExpensesCSV(
    userId: string,
    petId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<string> {
    const whereClause: ExpenseFilter = { userId };

    if (petId) {
      whereClause.petId = petId;
    }

    if (startDate || endDate) {
      const dateQuery: { $gte?: Date; $lte?: Date } = {};
      whereClause.date = dateQuery;
      if (startDate) {
        dateQuery.$gte = startDate;
      }
      if (endDate) {
        dateQuery.$lte = endDate;
      }
    }

    const expenseList = await ExpenseModel.find(whereClause)
      .sort({ date: -1 })
      .exec();

    const escapeCsvValue = (value: string): string =>
      `"${value.replace(/"/g, '""')}"`;

    const headers = [
      'ID',
      'Pet ID',
      'Category',
      'Amount',
      'Currency',
      'Amount Base',
      'Base Currency',
      'FX Rate',
      'FX As Of',
      'Payment Method',
      'Description',
      'Date',
      'Vendor',
      'Notes',
    ];
    const rows = expenseList.map((expense: HydratedDocument<IExpenseDocument>) => [
      expense._id.toString(),
      expense.petId.toString(),
      expense.category,
      expense.amount.toString(),
      expense.currency,
      expense.amountBase?.toString() ?? '',
      expense.baseCurrency ?? '',
      expense.fxRate?.toString() ?? '',
      expense.fxAsOf?.toISOString() ?? '',
      expense.paymentMethod ?? '',
      expense.description ?? '',
      expense.date.toISOString(),
      expense.vendor ?? '',
      expense.notes ?? '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => escapeCsvValue(String(cell))).join(',')),
    ].join('\n');

    return csvContent;
  }

  async exportExpensesPDF(
    userId: string,
    petId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<Buffer> {
    const whereClause: ExpenseFilter = { userId };

    if (petId) {
      whereClause.petId = petId;
    }

    if (startDate || endDate) {
      const dateQuery: { $gte?: Date; $lte?: Date } = {};
      whereClause.date = dateQuery;
      if (startDate) {
        dateQuery.$gte = startDate;
      }
      if (endDate) {
        dateQuery.$lte = endDate;
      }
    }

    const expenses = await ExpenseModel.find(whereClause)
      .sort({ date: -1 })
      .exec();

    const baseCurrency = await userSettingsService.getUserBaseCurrency(userId);
    const totalsByCategoryCurrency: Record<string, number> = {};
    const totalsByCurrency: Record<string, number> = {};
    const totalsBase: number = expenses.reduce((sum, exp) => sum + (exp.amountBase ?? 0), 0);

    for (const expense of expenses) {
      const category = expense.category || 'other';
      const currency = expense.currency || 'UNKNOWN';
      const key = `${category}__${currency}`;
      totalsByCategoryCurrency[key] = (totalsByCategoryCurrency[key] ?? 0) + expense.amount;
      totalsByCurrency[currency] = (totalsByCurrency[currency] ?? 0) + expense.amount;
    }

    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', chunk => {
      chunks.push(chunk as Buffer);
    });

    const formatCurrency = (value: number, currency?: string): string =>
      `${value.toFixed(2)} ${currency ?? ''}`.trim();

    doc.fontSize(18).text('Expenses Report', { align: 'center' });
    doc.moveDown(0.5);
    doc
      .fontSize(10)
      .text(
        `Date: ${new Date().toISOString()}${startDate || endDate ? ` | Range: ${startDate?.toISOString() ?? '-'} to ${endDate?.toISOString() ?? '-'}` : ''}`,
        { align: 'center' }
      );

    doc.moveDown();
    doc.fontSize(12).text('Summary', { underline: true });
    doc.moveDown(0.25);
    doc.fontSize(10).text(`Total records: ${expenses.length}`);
    doc.text(`Total (base currency): ${formatCurrency(totalsBase, baseCurrency)}`);
    const currencyEntries = Object.entries(totalsByCurrency);
    if (currencyEntries.length > 0) {
      doc.text('Total by original currency:');
      currencyEntries.forEach(([currency, total]) => {
        doc.fontSize(10).text(`- ${formatCurrency(total, currency)}`);
      });
    }

    doc.moveDown(0.5);
    doc.fontSize(11).text('Totals by category:');
    const categoryCurrencyEntries = Object.entries(totalsByCategoryCurrency);
    categoryCurrencyEntries.forEach(([key, total]) => {
      const [category, currency] = key.split('__');
      doc.fontSize(10).text(`- ${category} (${currency}): ${formatCurrency(total, currency)}`);
    });

    doc.moveDown();
    doc.fontSize(12).text('Expenses', { underline: true });
    doc.moveDown(0.25);

    expenses.forEach(expense => {
      doc
        .fontSize(10)
        .text(
          `${expense.date.toISOString().split('T')[0]} • ${expense.category} • ${formatCurrency(expense.amount, expense.currency)}${expense.amountBase ? ` (≈ ${formatCurrency(expense.amountBase, expense.baseCurrency)})` : ''}`,
          { continued: false }
        );
      if (expense.description) {
        doc.fontSize(9).fillColor('gray').text(expense.description);
        doc.fillColor('black');
      }
      if (expense.vendor || expense.notes) {
        doc
          .fontSize(9)
          .text(
            [expense.vendor ? `Vendor: ${expense.vendor}` : null, expense.notes ? `Notes: ${expense.notes}` : null]
              .filter(Boolean)
              .join(' • ')
          );
      }
      doc.moveDown(0.5);
    });

    doc.end();

    return await new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
  }

  private round(value: number, decimals = 2): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }
}
