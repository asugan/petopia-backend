import { Router } from 'express';
import { EventController } from '../controllers/eventController';
import { validateRequest } from '../middleware/validation';
import { z } from 'zod';
import { validateObjectId } from '../utils/mongodb-validation';

const router = Router({ mergeParams: true });
const eventController = new EventController();

// Validation schemas
const createEventSchema = z.object({
  petId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid pet ID format'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  type: z.enum([
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
  ]),
  startTime: z.string().datetime('Invalid start time format'),
  endTime: z.string().datetime('Invalid end time format').optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  reminder: z.boolean().optional(),
  reminderPreset: z.enum(['standard', 'compact', 'minimal']).optional(),
  status: z.enum(['upcoming', 'completed', 'cancelled', 'missed']).optional(),
  vaccineName: z.string().optional(),
  vaccineManufacturer: z.string().optional(),
  batchNumber: z.string().optional(),
  medicationName: z.string().optional(),
  dosage: z.string().optional(),
  frequency: z.string().optional(),
});

const updateEventSchema = createEventSchema.partial();

const dateParamSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (expected YYYY-MM-DD)'),
});

// Routes
router.get('/upcoming', eventController.getUpcomingEvents);

router.get('/today', eventController.getTodayEvents);

router.get(
  '/calendar/:date',
  validateRequest(dateParamSchema, 'params'),
  eventController.getEventsByDate
);

router.get('/', eventController.getEventsByPetId);

router.get('/:id', validateObjectId(), eventController.getEventById);

router.post(
  '/',
  validateRequest(createEventSchema),
  eventController.createEvent
);

router.put(
  '/:id',
  validateObjectId(),
  validateRequest(updateEventSchema),
  eventController.updateEvent
);

router.delete('/:id', validateObjectId(), eventController.deleteEvent);

export default router;
