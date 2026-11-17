import express from "express";

import {
  listProjectSpreadsheets,
  listSpreadsheetSheets,
  listSpreadsheetColumns,
} from "../controllers/googleSheetsController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { planUsageMiddleware } from "../middleware/planUsageMiddleware.js";

const router = express.Router();

router.get("/files", authMiddleware, planUsageMiddleware, listProjectSpreadsheets);
router.get("/:spreadsheetId/columns", authMiddleware, planUsageMiddleware, listSpreadsheetColumns);
router.get("/:spreadsheetId/sheets", authMiddleware, planUsageMiddleware, listSpreadsheetSheets);

export default router;
