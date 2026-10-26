import { Router } from "express";
import { projectController } from "../controllers/projectController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/", authMiddleware, projectController.getProjects);
router.post("/", authMiddleware, projectController.createProject);
router.delete("/:id", authMiddleware, projectController.deleteProject);

export default router;