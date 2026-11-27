import { Router } from "express";
import { dashboardMetricsController } from "../controllers/dashboardMetricsController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/schedule-metrics", authMiddleware, dashboardMetricsController.getScheduleMetrics);

export default router;
