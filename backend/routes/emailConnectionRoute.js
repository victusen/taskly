import express from "express";

import {
  createEmailConnection, 
  deleteEmailConnection,
  getProjectEmailConnection,
  listEmailConnections
} from "../controllers/emailConnectionsController.js";

import {
  startGoogleOAuth,
  googleOAuthCallback,
} from "../controllers/googleOAuthController.js";

import {
  authMiddleware,
} from "../middleware/authMiddleware.js";
import { planUsageMiddleware } from "../middleware/planUsageMiddleware.js";

const router =
  express.Router();

router.post(
  "/",
  authMiddleware,
  planUsageMiddleware,
  createEmailConnection
);

router.get(
  "/", 
  authMiddleware, 
  planUsageMiddleware,
  listEmailConnections);

router.get(
  "/project/:projectId",
  authMiddleware,
  planUsageMiddleware,
  getProjectEmailConnection
);

router.get(
  "/google/start",
  authMiddleware,
  planUsageMiddleware,
  startGoogleOAuth
);

router.get(
  "/google/callback",
  googleOAuthCallback
);

router.delete(
  "/:id", 
  authMiddleware, 
  planUsageMiddleware,
  deleteEmailConnection);

export default router;
