import { Router } from "express";
import { projectController } from "../controllers/projectController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/", authMiddleware, projectController.getProjects);

export default router;