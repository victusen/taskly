import { Router } from "express";
import rateLimit from "express-rate-limit";
import { feedbackController } from "../controllers/feedbackController.js";
import { optionalAuthMiddleware } from "../middleware/authMiddleware.js";

const router = Router();

const submitFeedbackLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: "RATE_LIMITED",
    message: "Too many feedback submissions. Please try again later.",
  },
});

router.post("/", submitFeedbackLimit, optionalAuthMiddleware, feedbackController.submit);

export default router;
