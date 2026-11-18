import { Router } from "express";
import { projectController } from "../controllers/projectController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { planUsageMiddleware } from "../middleware/planUsageMiddleware.js";

const router = Router();

router.get("/", authMiddleware, projectController.getProjects);
router.post("/", authMiddleware, planUsageMiddleware, projectController.createProject);
router.patch("/:id/status", authMiddleware, planUsageMiddleware, projectController.updateProjectStatus);
router.delete("/:id", authMiddleware, planUsageMiddleware, projectController.deleteProject);

export default router;