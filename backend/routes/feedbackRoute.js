import { Router } from "express";
import rateLimit from "express-rate-limit";
import { feedbackController } from "../controllers/feedbackController.js";

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

router.post("/", submitFeedbackLimit, feedbackController.submit);

export default router;
