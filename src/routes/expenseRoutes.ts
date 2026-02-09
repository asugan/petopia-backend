import { Router } from 'express';
import { ExpenseController } from '../controllers/expenseController';
import { requireActiveSubscription } from '../middleware/subscription';
import { validateRequest } from '../middleware/validation';
import { z } from 'zod';
import { validateObjectId } from '../utils/mongodb-validation';

const router = Router({ mergeParams: true });
const expenseController = new ExpenseController();

// Validation schemas
const expenseCategories = [
  'food',
  'premium_food',
  'veterinary',
  'vaccination',
  'medication',
  'grooming',
  'toys',
  'accessories',
  'training',
  'insurance',
  'emergency',
  'other',
] as const;

const paymentMethods = [
  'cash',
  'credit_card',
  'debit_card',
  'bank_transfer',
] as const;

const isoDateTimeWithZoneRegex =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const localDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const dateQuerySchema = z.union([
  z.string().regex(localDateRegex, 'Date must be YYYY-MM-DD'),
  z.string().regex(
    isoDateTimeWithZoneRegex,
    'Datetime must include timezone offset or Z'
  ),
]);

const createExpenseSchema = z.object({
  petId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid pet ID format'),
  category: z.enum(expenseCategories, { message: 'Invalid category' }),
  amount: z.number().positive('Amount must be positive'),
  currency: z
    .string()
    .length(3, 'Currency must be 3 characters (e.g., TRY, USD, EUR)')
    .optional(),
  paymentMethod: z.enum(paymentMethods).optional(),
  date: dateQuerySchema,
});

const updateExpenseSchema = z.object({
  category: z.enum(expenseCategories).optional(),
  amount: z.number().positive('Amount must be positive').optional(),
  currency: z.string().length(3, 'Currency must be 3 characters').optional(),
  paymentMethod: z.enum(paymentMethods).optional(),
  date: dateQuerySchema.optional(),
});

const expenseListQuerySchema = z
  .object({
    petId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid pet ID format').optional(),
    page: z.coerce.number().int().min(1).max(1000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    category: z.enum(expenseCategories).optional(),
    startDate: dateQuerySchema.optional(),
    endDate: dateQuerySchema.optional(),
    minAmount: z.coerce.number().nonnegative().optional(),
    maxAmount: z.coerce.number().nonnegative().optional(),
    currency: z.string().length(3).optional(),
    paymentMethod: z.enum(paymentMethods).optional(),
  })
  .refine(
    data =>
      data.minAmount === undefined ||
      data.maxAmount === undefined ||
      data.minAmount <= data.maxAmount,
    {
      message: 'minAmount cannot be greater than maxAmount',
      path: ['minAmount'],
    }
  );

const expenseStatsQuerySchema = z.object({
  petId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid pet ID format').optional(),
  startDate: dateQuerySchema.optional(),
  endDate: dateQuerySchema.optional(),
  category: z.enum(expenseCategories).optional(),
});

const expenseDateRangeQuerySchema = z.object({
  petId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid pet ID format').optional(),
  startDate: dateQuerySchema,
  endDate: dateQuerySchema,
});

const expenseMonthlyQuerySchema = z.object({
  petId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid pet ID format').optional(),
  year: z.coerce.number().int().min(1970).max(9999).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

const expenseYearlyQuerySchema = z.object({
  petId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid pet ID format').optional(),
  year: z.coerce.number().int().min(1970).max(9999).optional(),
});

const expenseExportQuerySchema = z.object({
  petId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid pet ID format').optional(),
  startDate: dateQuerySchema.optional(),
  endDate: dateQuerySchema.optional(),
});

// Special routes (must come before parameterized routes)
router.get('/stats', validateRequest(expenseStatsQuerySchema, 'query'), expenseController.getExpenseStats);
router.get('/by-date', validateRequest(expenseDateRangeQuerySchema, 'query'), expenseController.getExpensesByDateRange);
router.get('/monthly', validateRequest(expenseMonthlyQuerySchema, 'query'), expenseController.getMonthlyExpenses);
router.get('/yearly', validateRequest(expenseYearlyQuerySchema, 'query'), expenseController.getYearlyExpenses);
router.get('/export/csv', requireActiveSubscription, validateRequest(expenseExportQuerySchema, 'query'), expenseController.exportExpensesCSV);
router.get('/export/pdf', requireActiveSubscription, validateRequest(expenseExportQuerySchema, 'query'), expenseController.exportExpensesPDF);
router.get('/export/vet-summary', requireActiveSubscription, expenseController.exportVetSummaryPDF);

// Category route
router.get('/by-category/:category', expenseController.getExpensesByCategory);

// Standard CRUD routes
router.get('/', validateRequest(expenseListQuerySchema, 'query'), expenseController.getExpensesByPetId);
router.get('/:id', validateObjectId(), expenseController.getExpenseById);
router.post(
  '/',
  validateRequest(createExpenseSchema),
  expenseController.createExpense
);
router.put(
  '/:id',
  validateObjectId(),
  validateRequest(updateExpenseSchema),
  expenseController.updateExpense
);
router.delete('/:id', validateObjectId(), expenseController.deleteExpense);

export default router;
