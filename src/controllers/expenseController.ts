import { NextFunction, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { ExpenseService } from '../services/expenseService';
import {
  getPaginationParams,
  successResponse,
} from '../utils/response';
import {
  CreateExpenseRequest,
  ExpenseQueryParams,
  UpdateExpenseRequest,
} from '../types/api';
import { createError } from '../middleware/errorHandler';
import { parseUTCDate } from '../lib/dateUtils';
import { IExpenseDocument } from '../models/mongoose';
import { ReportService } from '../services/reportService';
import { toString } from '../utils/express-utils';

export class ExpenseController {
  private expenseService: ExpenseService;
  private reportService: ReportService;

  constructor() {
    this.expenseService = new ExpenseService();
    this.reportService = new ReportService();
  }

  private getQuerySource(req: AuthenticatedRequest): Record<string, unknown> {
    return (req.validatedQuery ?? req.query) as Record<string, unknown>;
  }

  private getStringQueryValue(req: AuthenticatedRequest, key: string): string | undefined {
    const source = this.getQuerySource(req);
    const value = source[key];

    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value) && typeof value[0] === 'string') {
      return value[0];
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    return undefined;
  }

  private parseOptionalUTCDateQuery(
    req: AuthenticatedRequest,
    key: string
  ): Date | undefined {
    const value = this.getStringQueryValue(req, key);
    if (!value) {
      return undefined;
    }

    try {
      return parseUTCDate(value);
    } catch {
      throw createError(`${key} must be a valid UTC date`, 400, 'INVALID_DATE_QUERY');
    }
  }

  private parseRequiredUTCDateInput(value: string | undefined, field: string): Date {
    if (!value) {
      throw createError(`${field} is required`, 400, 'MISSING_REQUIRED_FIELDS');
    }

    try {
      return parseUTCDate(value);
    } catch {
      throw createError(`${field} must be a valid UTC date`, 400, 'INVALID_DATE_BODY');
    }
  }

  private parseOptionalUTCDateInput(value: string | undefined, field: string): Date | undefined {
    if (!value) {
      return undefined;
    }

    try {
      return parseUTCDate(value);
    } catch {
      throw createError(`${field} must be a valid UTC date`, 400, 'INVALID_DATE_BODY');
    }
  }

  private parseOptionalNumberQuery(
    req: AuthenticatedRequest,
    key: string
  ): number | undefined {
    const value = this.getStringQueryValue(req, key);
    if (!value) {
      return undefined;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw createError(`${key} must be a valid number`, 400, 'INVALID_NUMBER_QUERY');
    }

    return parsed;
  }

  // GET /api/expenses OR /api/pets/:petId/expenses - Get expenses for authenticated user
  getExpensesByPetId = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      // Support both URL params (/pets/:petId/expenses) and query string (/expenses?petId=...)
      const petId = toString(req.params.petId) || (this.getStringQueryValue(req, 'petId') ?? '');
      const page = this.parseOptionalNumberQuery(req, 'page') ?? 1;
      const limit = this.parseOptionalNumberQuery(req, 'limit') ?? 10;
      const params: ExpenseQueryParams = {
        ...getPaginationParams({
          page: String(page),
          limit: String(limit),
        } as typeof req.query),
        category: this.getStringQueryValue(req, 'category'),
        startDate: this.parseOptionalUTCDateQuery(req, 'startDate'),
        endDate: this.parseOptionalUTCDateQuery(req, 'endDate'),
        minAmount: this.parseOptionalNumberQuery(req, 'minAmount'),
        maxAmount: this.parseOptionalNumberQuery(req, 'maxAmount'),
        currency: this.getStringQueryValue(req, 'currency'),
        paymentMethod: this.getStringQueryValue(req, 'paymentMethod'),
      };

      const { expenses, total } = await this.expenseService.getExpensesByPetId(
        userId,
        petId,
        params
      );
      const meta = {
        total,
        page: params.page ?? 1,
        limit: params.limit ?? 10,
        totalPages: Math.ceil(total / limit),
      };

      successResponse(res, expenses, 200, meta);
    } catch (error) {
      next(error);
    }
  };

  // GET /api/expenses/:id - Get expense by ID
  getExpenseById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const id = toString(req.params.id);

      if (!id) {
        throw createError('Expense ID is required', 400, 'MISSING_ID');
      }

      const expense = await this.expenseService.getExpenseById(userId, id);

      if (!expense) {
        throw createError('Expense not found', 404, 'EXPENSE_NOT_FOUND');
      }

      successResponse(res, expense);
    } catch (error) {
      next(error);
    }
  };

  // POST /api/expenses - Create new expense
  createExpense = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const expenseData = req.body as CreateExpenseRequest;

      // Validation
      if (
        !expenseData.petId ||
        !expenseData.category ||
        expenseData.amount === undefined ||
        !expenseData.date
      ) {
        throw createError(
          'Pet ID, category, amount, and date are required',
          400,
          'MISSING_REQUIRED_FIELDS'
        );
      }

      // Convert date string to UTC Date object
      const convertedExpenseData = {
        ...expenseData,
        date: this.parseRequiredUTCDateInput(expenseData.date, 'date'),
      };

      const expense = await this.expenseService.createExpense(
        userId,
        convertedExpenseData as unknown as Partial<IExpenseDocument>
      );

      successResponse(res, expense, 201);
    } catch (error) {
      next(error);
    }
  };

  // PUT /api/expenses/:id - Update expense
  updateExpense = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const id = toString(req.params.id);
      const updates = req.body as UpdateExpenseRequest;

      if (!id) {
        throw createError('Expense ID is required', 400, 'MISSING_ID');
      }

      // Convert date string to UTC Date object if provided
      const updateData: Partial<IExpenseDocument> = {
        ...updates,
        date: this.parseOptionalUTCDateInput(updates.date, 'date'),
      } as Partial<IExpenseDocument>;

      const expense = await this.expenseService.updateExpense(
        userId,
        id,
        updateData
      );

      if (!expense) {
        throw createError('Expense not found', 404, 'EXPENSE_NOT_FOUND');
      }

      successResponse(res, expense);
    } catch (error) {
      next(error);
    }
  };

  // DELETE /api/expenses/:id - Delete expense
  deleteExpense = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const id = toString(req.params.id);

      if (!id) {
        throw createError('Expense ID is required', 400, 'MISSING_ID');
      }

      const deleted = await this.expenseService.deleteExpense(userId, id);

      if (!deleted) {
        throw createError('Expense not found', 404, 'EXPENSE_NOT_FOUND');
      }

      successResponse(res, { message: 'Expense deleted successfully' });
    } catch (error) {
      next(error);
    }
  };

  // GET /api/expenses/stats - Get expense statistics
  getExpenseStats = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const petId = this.getStringQueryValue(req, 'petId');
      const startDate = this.parseOptionalUTCDateQuery(req, 'startDate');
      const endDate = this.parseOptionalUTCDateQuery(req, 'endDate');
      const category = this.getStringQueryValue(req, 'category');

      const stats = await this.expenseService.getExpenseStats(
        userId,
        petId,
        startDate,
        endDate,
        category
      );
      successResponse(res, stats);
    } catch (error) {
      next(error);
    }
  };

  // GET /api/expenses/by-date - Get expenses by date range
  getExpensesByDateRange = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const petId = this.getStringQueryValue(req, 'petId');
      const startDate = this.parseOptionalUTCDateQuery(req, 'startDate');
      const endDate = this.parseOptionalUTCDateQuery(req, 'endDate');

      if (!startDate || !endDate) {
        throw createError(
          'Start date and end date are required',
          400,
          'MISSING_DATE_RANGE'
        );
      }

      const expenses = await this.expenseService.getExpensesByDateRange(
        userId,
        petId,
        startDate,
        endDate
      );
      successResponse(res, expenses);
    } catch (error) {
      next(error);
    }
  };

  // GET /api/expenses/monthly - Get monthly expenses
  getMonthlyExpenses = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const petId = this.getStringQueryValue(req, 'petId');
      const yearValue = this.getStringQueryValue(req, 'year');
      const year = yearValue ? parseInt(yearValue, 10) : undefined;
      const month =
        this.getStringQueryValue(req, 'month') !== undefined
          ? parseInt(this.getStringQueryValue(req, 'month') as string, 10)
          : undefined;

      const expenses = await this.expenseService.getMonthlyExpenses(
        userId,
        petId,
        year,
        month
      );
      successResponse(res, expenses);
    } catch (error) {
      next(error);
    }
  };

  // GET /api/expenses/yearly - Get yearly expenses
  getYearlyExpenses = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const petId = this.getStringQueryValue(req, 'petId');
      const yearValue = this.getStringQueryValue(req, 'year');
      const year = yearValue ? parseInt(yearValue, 10) : undefined;

      const expenses = await this.expenseService.getYearlyExpenses(
        userId,
        petId,
        year
      );
      successResponse(res, expenses);
    } catch (error) {
      next(error);
    }
  };

  // GET /api/expenses/by-category/:category - Get expenses by category
  getExpensesByCategory = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const category = toString(req.params.category);
      const petId = toString(req.query.petId as string | string[] | undefined);

      if (!category) {
        throw createError('Category is required', 400, 'MISSING_CATEGORY');
      }

      const expenses = await this.expenseService.getExpensesByCategory(
        userId,
        category,
        petId
      );
      successResponse(res, expenses);
    } catch (error) {
      next(error);
    }
  };

  // GET /api/expenses/export/csv - Export expenses as CSV
  exportExpensesCSV = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const petId = this.getStringQueryValue(req, 'petId');
      const startDate = this.parseOptionalUTCDateQuery(req, 'startDate');
      const endDate = this.parseOptionalUTCDateQuery(req, 'endDate');

      const csvContent = await this.expenseService.exportExpensesCSV(
        userId,
        petId,
        startDate,
        endDate
      );

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="expenses.csv"'
      );
      res.status(200).send(csvContent);
    } catch (error) {
      next(error);
    }
  };

  // GET /api/expenses/export/pdf - Export expenses as PDF
  exportExpensesPDF = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const petId = this.getStringQueryValue(req, 'petId');
      const startDate = this.parseOptionalUTCDateQuery(req, 'startDate');
      const endDate = this.parseOptionalUTCDateQuery(req, 'endDate');

      const pdfBuffer = await this.expenseService.exportExpensesPDF(
        userId,
        petId,
        startDate,
        endDate
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="expenses.pdf"'
      );
      res.status(200).send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  };

  // GET /api/expenses/export/vet-summary - Export vet summary PDF
  exportVetSummaryPDF = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = requireAuth(req);
      const petId = toString(req.query.petId as string | string[] | undefined);

      if (!petId) {
        throw createError('Pet ID is required for vet summary', 400, 'MISSING_PET_ID');
      }

      const pdfBuffer = await this.reportService.generateVetSummaryPDF({
        userId,
        petId,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="vet-summary-${petId}.pdf"`
      );
      res.status(200).send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  };
}
