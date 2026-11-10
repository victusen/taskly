import { google } from "googleapis";

import { supabase } from "../config/supabase.js";
import { createGoogleOAuthClient } from "../services/googleOAuthService.js";
import { assertOwnedProject } from "../services/emailConnectionService.js";
import { decryptJson, encryptJson } from "../utils/credentialCrypto.js";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const SPREADSHEET_ID_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

async function getProjectGoogleClient(userId, projectId) {
  await assertOwnedProject(userId, projectId);

  const { data: connection, error } = await supabase
    .from("email_connections")
    .select("id, provider, connection_type, status, credentials")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) throw error;
  if (!connection || connection.provider !== "google" || connection.connection_type !== "oauth2" || connection.status !== "active") {
    const connectionError = new Error("Connect a Google account to this project before choosing a spreadsheet.");
    connectionError.status = 409;
    throw connectionError;
  }

  const credentials = decryptJson(connection.credentials);
  const grantedScopes = new Set(String(credentials.scope || "").split(/\s+/));
  if (!grantedScopes.has(SHEETS_SCOPE) || !grantedScopes.has(DRIVE_FILE_SCOPE)) {
    const scopeError = new Error("Reconnect Google and approve spreadsheet and file access to continue.");
    scopeError.status = 409;
    throw scopeError;
  }
  if (!credentials.refresh_token) {
    const tokenError = new Error("Reconnect Google to restore spreadsheet access.");
    tokenError.status = 409;
    throw tokenError;
  }

  const client = createGoogleOAuthClient();
  client.setCredentials(credentials);

  if (!credentials.access_token || Number(credentials.expiry_date || 0) <= Date.now() + 60_000) {
    const { credentials: refreshed } = await client.refreshAccessToken();
    const nextCredentials = {
      ...credentials,
      ...refreshed,
      refresh_token: refreshed.refresh_token || credentials.refresh_token,
      scope: refreshed.scope || credentials.scope,
    };
    const { error: updateError } = await supabase
      .from("email_connections")
      .update({ credentials: encryptJson(nextCredentials) })
      .eq("id", connection.id);
    if (updateError) throw updateError;
    client.setCredentials(nextCredentials);
  }

  return client;
}

function sendError(res, error) {
  if (error.status) {
    return res.status(error.status).json({
      success: false,
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

    const auth = await getProjectGoogleClient(req.user.id, projectId);
    const drive = google.drive({ version: "v3", auth });
    const { data } = await drive.files.list({
      q: "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
      fields: "files(id,name)",
      orderBy: "name",
      pageSize: 1000,
      spaces: "drive",
    });

    return res.status(200).json({
      success: true,
      data: (data.files || []).map(({ id, name }) => ({ id, name })),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function listSpreadsheetSheets(req, res) {
  try {
    const projectId = req.query.project_id;
    const spreadsheetId = req.params.spreadsheetId;
    if (typeof projectId !== "string" || !SPREADSHEET_ID_PATTERN.test(String(spreadsheetId || ""))) {
      return res.status(400).json({ success: false, message: "A valid project and spreadsheet are required." });
    }

    const auth = await getProjectGoogleClient(req.user.id, projectId);
    const sheetsApi = google.sheets({ version: "v4", auth });
    const { data } = await sheetsApi.spreadsheets.get({
      spreadsheetId,
      fields: "spreadsheetId,properties(title),sheets(properties(sheetId,title,index))",
    });

    return res.status(200).json({
      success: true,
      data: (data.sheets || []).map(({ properties }) => ({
        id: properties.sheetId,
        title: properties.title,
        index: properties.index,
      })),
    });
  } catch (error) {
    return sendError(res, error);
  }
}
