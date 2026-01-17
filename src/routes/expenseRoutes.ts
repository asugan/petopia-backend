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

const createExpenseSchema = z.object({
  petId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid pet ID format'),
  category: z.enum(expenseCategories, { message: 'Invalid category' }),
  amount: z.number().positive('Amount must be positive'),
  currency: z
    .string()
    .length(3, 'Currency must be 3 characters (e.g., TRY, USD, EUR)')
    .optional(),
  paymentMethod: z.enum(paymentMethods).optional(),
  description: z.string().optional(),
  date: z.string().min(1, 'Date is required'),
  receiptPhoto: z.string().url('Receipt photo must be a valid URL').optional(),
  vendor: z.string().optional(),
  notes: z.string().optional(),
});

const updateExpenseSchema = z.object({
  category: z.enum(expenseCategories).optional(),
  amount: z.number().positive('Amount must be positive').optional(),
  currency: z.string().length(3, 'Currency must be 3 characters').optional(),
  paymentMethod: z.enum(paymentMethods).optional(),
  description: z.string().optional(),
  date: z.string().optional(),
  receiptPhoto: z.string().url('Receipt photo must be a valid URL').optional(),
  vendor: z.string().optional(),
  notes: z.string().optional(),
});

// Special routes (must come before parameterized routes)
router.get('/stats', expenseController.getExpenseStats);
router.get('/by-date', expenseController.getExpensesByDateRange);
router.get('/monthly', expenseController.getMonthlyExpenses);
router.get('/yearly', expenseController.getYearlyExpenses);
router.get('/export/csv', requireActiveSubscription, expenseController.exportExpensesCSV);
router.get('/export/pdf', requireActiveSubscription, expenseController.exportExpensesPDF);
router.get('/export/vet-summary', requireActiveSubscription, expenseController.exportVetSummaryPDF);

// Category route
router.get('/by-category/:category', expenseController.getExpensesByCategory);

// Standard CRUD routes
router.get('/', expenseController.getExpensesByPetId);
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
