import { Router } from "express";
import rateLimit from "express-rate-limit";
import { invitationController } from "../controllers/invitationController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = Router();

const createInvitationLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: "RATE_LIMITED",
    message: "Too many invitations. Please try again later.",
  },
});

router.post("/", authMiddleware, createInvitationLimit, invitationController.create);

export default router;
