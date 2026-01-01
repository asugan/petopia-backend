import { Router } from 'express';
import { AccountController } from '../controllers/accountController';
import { rateLimiter } from '../middleware/rateLimiter';

const router = Router({ mergeParams: true });
const accountController = new AccountController();

// Apply rate limiting to the deletion endpoint
router.use('/', rateLimiter);

router.delete('/', accountController.deleteAccount);

export default router;
