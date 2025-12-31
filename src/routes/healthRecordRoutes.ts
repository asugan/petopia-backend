import { NextFunction, Response, Router } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { HealthRecordController } from '../controllers/healthRecordController';
import { validateRequest } from '../middleware/validation';
import { z } from 'zod';
import { validateObjectId } from '../utils/mongodb-validation';

const router = Router({ mergeParams: true });
const healthRecordController = new HealthRecordController();

// Validation schemas
const createHealthRecordSchema = z.object({
  petId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid pet ID format'),
  type: z.enum([
    'checkup',
    'visit',
    'surgery',
    'dental',
    'grooming',
    'other',
  ]),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  date: z.string().datetime('Invalid date format'),
  veterinarian: z.string().optional(),
  clinic: z.string().optional(),
  cost: z.number().nonnegative().optional(),
  notes: z.string().optional(),
  attachments: z.string().optional(),
  treatmentPlan: z.array(z.object({
    name: z.string().min(1, 'Treatment name is required'),
    dosage: z.string().min(1, 'Dosage is required'),
    frequency: z.string().min(1, 'Frequency is required'),
    duration: z.string().optional(),
    notes: z.string().optional(),
  })).optional(),
  nextVisitDate: z.string().datetime('Invalid next visit date format').optional(),
});

const updateHealthRecordSchema = createHealthRecordSchema
  .omit({ petId: true })
  .partial()
  .extend({
    // Allow explicit clearing of next visit (unlink + delete linked Event)
    nextVisitDate: z
      .union([
        z.string().datetime('Invalid next visit date format'),
        z.null(),
      ])
      .optional(),
  });

// GET / - If called as /api/health-records, use getAllHealthRecords (accepts petId as query param)
// GET / - If called as /api/pets/:petId/health-records, use getHealthRecordsByPetId (gets petId from params)
router.get('/', (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // Check if petId exists in params (nested route) or query (standalone route)
  if (req.params.petId) {
    return healthRecordController.getHealthRecordsByPetId(req, res, next);
  } else {
    return healthRecordController.getAllHealthRecords(req, res, next);
  }
});

router.get('/:id', validateObjectId(), healthRecordController.getHealthRecordById);

router.post(
  '/',
  validateRequest(createHealthRecordSchema),
  healthRecordController.createHealthRecord
);

router.put(
  '/:id',
  validateObjectId(),
  validateRequest(updateHealthRecordSchema),
  healthRecordController.updateHealthRecord
);

router.delete('/:id', validateObjectId(), healthRecordController.deleteHealthRecord);

export default router;
