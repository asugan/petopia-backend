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

export class ExpenseController {
  private expenseService: ExpenseService;
  private reportService: ReportService;

  constructor() {
    this.expenseService = new ExpenseService();
    this.reportService = new ReportService();
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
      const petId = req.params.petId ?? (req.query.petId as string);
      const params: ExpenseQueryParams = {
        ...getPaginationParams(req.query),
        category: req.query.category as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        minAmount: req.query.minAmount
          ? parseFloat(req.query.minAmount as string)
          : undefined,
        maxAmount: req.query.maxAmount
          ? parseFloat(req.query.maxAmount as string)
          : undefined,
        currency: req.query.currency as string,
        paymentMethod: req.query.paymentMethod as string,
      };

      const { expenses, total } = await this.expenseService.getExpensesByPetId(
        userId,
        petId,
        params
      );
      const page = params.page ?? 1;
      const limit = params.limit ?? 10;
      const meta = {
        total,
        page,
        limit,
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
      const { id } = req.params;

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
        date: parseUTCDate(expenseData.date),
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
      const { id } = req.params;
      const updates = req.body as UpdateExpenseRequest;

      if (!id) {
        throw createError('Expense ID is required', 400, 'MISSING_ID');
      }

      // Convert date string to UTC Date object if provided
      const updateData: Partial<IExpenseDocument> = {
        ...updates,
        date: updates.date ? parseUTCDate(updates.date) : undefined,
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
      const { id } = req.params;

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
      const petId = req.query.petId as string;
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : undefined;
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : undefined;
      const category = req.query.category as string;

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
      const petId = req.query.petId as string;
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : undefined;
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : undefined;

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
      const petId = req.query.petId as string;
      const year = req.query.year
        ? parseInt(req.query.year as string)
        : undefined;
      const month =
        req.query.month !== undefined
          ? parseInt(req.query.month as string)
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
      const petId = req.query.petId as string;
      const year = req.query.year
        ? parseInt(req.query.year as string)
        : undefined;

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
      const { category } = req.params;
      const petId = req.query.petId as string;

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
      const petId = req.query.petId as string;
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : undefined;
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : undefined;

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
      const petId = req.query.petId as string;
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : undefined;
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : undefined;

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
      const petId = req.query.petId as string;

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
