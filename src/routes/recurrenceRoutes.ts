import { Router } from 'express';
import { RecurrenceController } from '../controllers/recurrenceController';
import { validateRequest } from '../middleware/validation';
import { requireInternalApiKey } from '../middleware/auth';
import { z } from 'zod';
import { validateObjectId } from '../utils/mongodb-validation';
import { isValidTimezone } from '../lib/timezone';

const router = Router();
const recurrenceController = new RecurrenceController();

const isoDateTimeWithZoneRegex =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

const dateOnlyOrDateTimeSchema = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (expected YYYY-MM-DD)'),
  z.string().regex(
    isoDateTimeWithZoneRegex,
    'Invalid date format (datetime must include timezone offset or Z)'
  ),
]);

const requiredTimezoneSchema = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length > 0, 'Timezone is required')
  .refine(isValidTimezone, 'Invalid IANA timezone identifier');

// Validation schemas
const eventTypeEnum = z.enum([
  'feeding',
  'exercise',
  'grooming',
  'play',
  'training',
  'vet_visit',
  'walk',
  'bath',
  'vaccination',
  'medication',
  'other',
]);

const frequencyEnum = z.enum([
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'custom',
  'times_per_day',
]);

const createRecurrenceRuleSchema = z.object({
  petId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid pet ID format'),
  title: z.string().min(1, 'Title is required'),
  type: eventTypeEnum,
  reminder: z.boolean().optional(),
  reminderPreset: z.enum(['standard', 'compact', 'minimal']).optional(),

  // Medication/Vaccination fields
  vaccineName: z.string().optional(),
  vaccineManufacturer: z.string().optional(),
  batchNumber: z.string().optional(),
  medicationName: z.string().optional(),
  dosage: z.string().optional(),

  // Recurrence settings
  frequency: frequencyEnum,
  interval: z.number().int().min(1).optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  timesPerDay: z.number().int().min(1).max(10).optional(),
  dailyTimes: z.array(z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format (expected HH:MM)')).optional(),

  // Timezone with IANA validation
  timezone: requiredTimezoneSchema,

  // Date boundaries
  startDate: z.string().regex(
    isoDateTimeWithZoneRegex,
    'Invalid start date format (must include timezone offset or Z)'
  ),
  endDate: dateOnlyOrDateTimeSchema.optional(),
});

const updateRecurrenceRuleSchema = createRecurrenceRuleSchema.partial().extend({
  isActive: z.boolean().optional(),
  endDate: dateOnlyOrDateTimeSchema.nullable().optional(),
});

const addExceptionSchema = z.object({
  date: z.string().regex(
    isoDateTimeWithZoneRegex,
    'Invalid date format (must include timezone offset or Z)'
  ),
});

// Routes
router.get('/', recurrenceController.getRules);

router.get('/:id', validateObjectId(), recurrenceController.getRuleById);

router.get('/:id/events', validateObjectId(), recurrenceController.getEventsByRuleId);

router.post(
  '/',
  validateRequest(createRecurrenceRuleSchema),
  recurrenceController.createRule
);

router.put(
  '/:id',
  validateObjectId(),
  validateRequest(updateRecurrenceRuleSchema),
  recurrenceController.updateRule
);

router.delete('/:id', validateObjectId(), recurrenceController.deleteRule);

router.post('/:id/regenerate', validateObjectId(), recurrenceController.regenerateEvents);

router.post(
  '/:id/exceptions',
  validateObjectId(),
  validateRequest(addExceptionSchema),
  recurrenceController.addException
);

// Internal endpoint for cron job - requires internal API key, not user auth
router.post('/generate-all', requireInternalApiKey, recurrenceController.generateAllEvents);

export default router;
