import express from "express";

import {
  createEmailConnection, 
  listEmailConnections
} from "../controllers/emailConnectionsController.js";

import {
  startGoogleOAuth,
  googleOAuthCallback,
} from "../controllers/googleOAuthController.js";

import {
  authMiddleware,
} from "../middleware/authMiddleware.js";

const router =
  express.Router();

router.post(
  "/",
  authMiddleware,
  createEmailConnection
);

router.get(
  "/", 
  authMiddleware, 
  listEmailConnections);

router.get(
  "/google/start",
  authMiddleware,
  startGoogleOAuth
);

router.get(
  "/google/callback",
  googleOAuthCallback
);

export default router;