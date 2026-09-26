import { Router } from 'express';

import { scheduleController } from '../controllers/scheduleController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

router.get(
  '/',
  authMiddleware,
  scheduleController.getSchedules
);

router.post(
  '/',
  authMiddleware,
  scheduleController.createSchedule
);

export default router;