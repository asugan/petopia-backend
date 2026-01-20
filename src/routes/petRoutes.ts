import { Router } from 'express';
import { PetController } from '../controllers/petController';
import { validateRequest } from '../middleware/validation';
import { z } from 'zod';
import { validateObjectId } from '../utils/mongodb-validation';

const router = Router();
const petController = new PetController();

// Validation schemas
const createPetSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string().min(1, 'Type is required'),
  breed: z.string().optional(),
  birthDate: z.string().datetime().optional(),
  weight: z.number().positive().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  profilePhoto: z.string().url().optional().nullable(),
});

const updatePetSchema = createPetSchema.partial();

const updatePhotoSchema = z.object({
  photoUrl: z.string().url('Invalid photo URL'),
});

const downgradeSchema = z.object({
  keepPetId: z.string().min(1, 'keepPetId is required'),
});

// Routes
router.get('/', petController.getAllPets);

router.get('/:id', validateObjectId(), petController.getPetById);

router.post('/', validateRequest(createPetSchema), petController.createPet);

router.put('/:id', validateObjectId(), validateRequest(updatePetSchema), petController.updatePet);

router.delete('/:id', validateObjectId(), petController.deletePet);

router.post(
  '/:id/photo',
  validateObjectId(),
  validateRequest(updatePhotoSchema),
  petController.updatePetPhoto
);

// Health records sub-routes
router.get('/:id/health-records', validateObjectId(), petController.getPetHealthRecords);

// Downgrade route (freemium - delete all pets except the selected one)
router.post('/downgrade', validateRequest(downgradeSchema), petController.downgrade);

export default router;
