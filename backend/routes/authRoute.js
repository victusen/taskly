
import { Router } from 'express';
import { authController } from '../controllers/authController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { planUsageMiddleware } from '../middleware/planUsageMiddleware.js';

const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);

router.get('/me', authMiddleware, planUsageMiddleware, authController.me);

export default router;