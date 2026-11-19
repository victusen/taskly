import { google } from "googleapis";

import {
  getGoogleSheetsClient,
  getSpreadsheetColumns,
  isSheetRow,
  isSpreadsheetId,
  normalizeGoogleSheetsError,
} from "../services/googleSheetsService.js";
import {
  disconnectProjectScheduleDatabase,
  getProjectScheduleDatabase,
  listProjectScheduleDatabases,
} from "../services/scheduleDatabaseService.js";

function sendError(res, error) {
  error = normalizeGoogleSheetsError(error);
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

function getConnectionId(req) {
  const connectionId = req.query.connection_id;
  if (typeof connectionId !== "string" || !connectionId) {
    throw Object.assign(new Error("Choose a Google Sheets connection."), {
      status: 400,
      code: "CONNECTION_REQUIRED",
    });
  }
  return connectionId;
}

export async function listProjectScheduleDatabaseConnections(req, res) {
  try {
    const projectId = req.query.project_id;
    if (typeof projectId !== "string") {
      return res.status(400).json({ success: false, message: "A valid project is required." });
    }

    return res.status(200).json({
      success: true,
      data: await listProjectScheduleDatabases(req.user.id, projectId),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getGoogleSheetsPickerConfig(req, res) {
  try {
    const projectId = req.query.project_id;
    if (typeof projectId !== "string") {
      return res.status(400).json({ success: false, message: "A valid project is required." });
    }

    const apiKey = process.env.GOOGLE_PICKER_API_KEY;
    const appId = process.env.GOOGLE_CLOUD_PROJECT_NUMBER;
    if (!apiKey || !/^\d+$/.test(String(appId || ""))) {
      return res.status(503).json({
        success: false,
        code: "GOOGLE_PICKER_NOT_CONFIGURED",
        message: "Google Picker is not configured. Set GOOGLE_PICKER_API_KEY and GOOGLE_CLOUD_PROJECT_NUMBER on the backend.",
      });
    }

    const connection = await getProjectScheduleDatabase(
      req.user.id,
      projectId,
      getConnectionId(req),
    );
    const auth = await getGoogleSheetsClient(connection, { requireDriveScope: true });
    const tokenResult = await auth.getAccessToken();
    const accessToken = typeof tokenResult === "string" ? tokenResult : tokenResult?.token;
    if (!accessToken) {
      throw new Error("Google did not provide an access token for Picker.");
    }

    return res.status(200).json({
      success: true,
      data: { apiKey, appId: String(appId), accessToken },
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function disconnectGoogleSheetsConnection(req, res) {
  try {
    const projectId = req.query.project_id;
    if (typeof projectId !== "string") {
      return res.status(400).json({ success: false, message: "A valid project is required." });
    }
    const data = await disconnectProjectScheduleDatabase(
      req.user.id,
      projectId,
      req.params.connectionId,
    );
    return res.status(200).json({ success: true, data });
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

    const connection = await getProjectScheduleDatabase(req.user.id, projectId, getConnectionId(req));
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

    const connection = await getProjectScheduleDatabase(req.user.id, projectId, getConnectionId(req));
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
