import { google } from "googleapis";

import {
  getGoogleSheetsClient,
  getProjectGoogleConnection,
  getSpreadsheetColumns,
  isSheetRow,
  isSpreadsheetId,
  listAccessibleSpreadsheets,
} from "../services/googleSheetsService.js";

function sendError(res, error) {
  if (error.status) {
    return res.status(error.status).json({
      success: false,
      code: error.code,
      message: error.message,
    });
  }
  console.error("[GOOGLE SHEETS]", error);
  return res.status(500).json({
    success: false,
    message: "Could not load Google spreadsheet details.",
  });
}

export async function listProjectSpreadsheets(req, res) {
  try {
    const projectId = req.query.project_id;
    if (typeof projectId !== "string") {
      return res.status(400).json({ success: false, message: "A valid project is required." });
    }

    const connection = await getProjectGoogleConnection(req.user.id, projectId);
    const auth = await getGoogleSheetsClient(connection, { requireDriveScope: true });
    const drive = google.drive({ version: "v3", auth });
    const files = await listAccessibleSpreadsheets(drive);

    return res.status(200).json({
      success: true,
      data: files.map(({ id, name }) => ({ id, name })),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function listSpreadsheetSheets(req, res) {
  try {
    const projectId = req.query.project_id;
    const spreadsheetId = req.params.spreadsheetId;
    if (typeof projectId !== "string" || !isSpreadsheetId(spreadsheetId)) {
      return res.status(400).json({ success: false, message: "A valid project and spreadsheet are required." });
    }

    const connection = await getProjectGoogleConnection(req.user.id, projectId);
    const auth = await getGoogleSheetsClient(connection);
    const sheetsApi = google.sheets({ version: "v4", auth });
    const { data } = await sheetsApi.spreadsheets.get({
      spreadsheetId,
      fields: "spreadsheetId,properties(title),sheets(properties(sheetId,title,index))",
    });

    return res.status(200).json({
      success: true,
      data: (data.sheets || []).flatMap(({ properties }) => properties ? [{
        id: properties.sheetId,
        title: properties.title,
        index: properties.index,
      }] : []),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function listSpreadsheetColumns(req, res) {
  try {
    const projectId = req.query.project_id;
    const spreadsheetId = req.params.spreadsheetId;
    const sheetId = req.query.sheet_id;
    const headerRow = Number(req.query.header_row);
    if (
      typeof projectId !== "string" ||
      !isSpreadsheetId(spreadsheetId) ||
      !/^\d+$/.test(String(sheetId || "")) ||
      !isSheetRow(headerRow)
    ) {
      return res.status(400).json({ success: false, message: "Choose a valid project, spreadsheet, sheet, and header row." });
    }

    const connection = await getProjectGoogleConnection(req.user.id, projectId);
    const auth = await getGoogleSheetsClient(connection);
    const sheetsApi = google.sheets({ version: "v4", auth });
    const columns = await getSpreadsheetColumns(sheetsApi, spreadsheetId, sheetId, headerRow);

    return res.status(200).json({
      success: true,
      data: columns,
    });
  } catch (error) {
    return sendError(res, error);
  }
}
