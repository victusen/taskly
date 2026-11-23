import express from "express";

import { startGoogleSheetsOAuth } from "../controllers/googleOAuthController.js";
import {
  listProjectScheduleDatabaseConnections,
  getGoogleSheetsPickerConfig,
  createGoogleSheetsSpreadsheet,
  disconnectGoogleSheetsConnection,
  listSpreadsheetSheets,
  listSpreadsheetColumns,
} from "../controllers/googleSheetsController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/oauth/start", authMiddleware, startGoogleSheetsOAuth);
router.get("/connections", authMiddleware, listProjectScheduleDatabaseConnections);
router.get("/picker-config", authMiddleware, getGoogleSheetsPickerConfig);
router.post("/spreadsheets", authMiddleware, createGoogleSheetsSpreadsheet);
router.delete("/connections/:connectionId", authMiddleware, disconnectGoogleSheetsConnection);
router.get("/:spreadsheetId/columns", authMiddleware, listSpreadsheetColumns);
router.get("/:spreadsheetId/sheets", authMiddleware, listSpreadsheetSheets);

export default router;
