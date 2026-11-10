import express from "express";

import {
  listProjectSpreadsheets,
  listSpreadsheetSheets,
} from "../controllers/googleSheetsController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/files", authMiddleware, listProjectSpreadsheets);
router.get("/:spreadsheetId/sheets", authMiddleware, listSpreadsheetSheets);

export default router;
