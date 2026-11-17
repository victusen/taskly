import { Router } from 'express';

import { scheduleController } from '../controllers/scheduleController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { planUsageMiddleware } from '../middleware/planUsageMiddleware.js';

const router = Router();

router.get(
  '/',
  authMiddleware,
  planUsageMiddleware,
  scheduleController.getSchedules
);

router.post(
  '/',
  authMiddleware,
  planUsageMiddleware,
  scheduleController.createSchedule
);

router.post("/send-now", authMiddleware, planUsageMiddleware, scheduleController.sendNow);
router.patch("/:id", authMiddleware, planUsageMiddleware, scheduleController.updateSchedule);
router.post("/:id/pause", authMiddleware, planUsageMiddleware, scheduleController.pauseSchedule);
router.post("/:id/resume", authMiddleware, planUsageMiddleware, scheduleController.resumeSchedule);
router.delete("/:id", authMiddleware, planUsageMiddleware, scheduleController.cancelSchedule);

export default router;