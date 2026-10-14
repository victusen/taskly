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

router.patch("/:id", authMiddleware, scheduleController.updateSchedule);
router.post("/:id/pause", authMiddleware, scheduleController.pauseSchedule);
router.post("/:id/resume", authMiddleware, scheduleController.resumeSchedule);
router.delete("/:id", authMiddleware, scheduleController.cancelSchedule);

export default router;