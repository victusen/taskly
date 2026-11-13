import { google } from "googleapis";

import { supabase } from "../config/supabase.js";
import { assertOwnedProject } from "./emailConnectionService.js";
import { createGoogleOAuthClient } from "./googleOAuthService.js";
import { decryptJson, encryptJson } from "../utils/credentialCrypto.js";

export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const MAX_SHEET_ROW = 1_000_000;
export const MAX_SHEET_RECIPIENTS = 500;

const SPREADSHEET_ID_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;
const COLUMN_PATTERN = /^[A-Z]{1,3}$/;

export class GoogleSheetsAccessError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isSpreadsheetId(value) {
  return typeof value === "string" && SPREADSHEET_ID_PATTERN.test(value);
}

export function isSheetRow(value) {
  return Number.isSafeInteger(Number(value)) && Number(value) >= 1 && Number(value) <= MAX_SHEET_ROW;
}

export function isColumnLetter(value) {
  if (typeof value !== "string" || !COLUMN_PATTERN.test(value)) return false;
  const index = [...value].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
  return index <= 16_384;
}

export function columnLetter(index) {
  let number = index + 1;
  let letter = "";
  while (number > 0) {
    const remainder = (number - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    number = Math.floor((number - 1) / 26);
  }
  return letter;
}

export async function getProjectGoogleConnection(userId, projectId) {
  await assertOwnedProject(userId, projectId);

  const { data: connection, error } = await supabase
    .from("email_connections")
    .select("id, project_id, provider, connection_type, status, credentials")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) throw error;
  if (
    !connection ||
    connection.provider !== "google" ||
    connection.connection_type !== "oauth2" ||
    connection.status !== "active"
  ) {
    throw new GoogleSheetsAccessError(
      409,
      "GOOGLE_CONNECTION_REQUIRED",
      "Connect an active Google account to this project before choosing a spreadsheet.",
    );
  }
  return connection;
}

export async function getGoogleSheetsClient(connection, { requireDriveScope = false } = {}) {
  const credentials = decryptJson(connection.credentials);
  const grantedScopes = new Set(String(credentials.scope || "").split(/\s+/).filter(Boolean));

  if (!grantedScopes.has(SHEETS_SCOPE) || (requireDriveScope && !grantedScopes.has(DRIVE_FILE_SCOPE))) {
    throw new GoogleSheetsAccessError(
      409,
      "GOOGLE_SCOPES_REQUIRED",
      "Reconnect Google and approve the requested Sheets and Drive access.",
    );
  }
  if (!credentials.refresh_token) {
    throw new GoogleSheetsAccessError(
      409,
      "GOOGLE_RECONNECT_REQUIRED",
      "Reconnect Google to restore spreadsheet access.",
    );
  }

  const client = createGoogleOAuthClient();
  client.setCredentials(credentials);

  if (!credentials.access_token || Number(credentials.expiry_date || 0) <= Date.now() + 60_000) {
    let refreshed;
    try {
      ({ credentials: refreshed } = await client.refreshAccessToken());
    } catch (error) {
      if (
        error?.response?.data?.error === "invalid_grant" ||
        String(error?.message || "").toLowerCase().includes("invalid_grant")
      ) {
        throw new GoogleSheetsAccessError(
          409,
          "GOOGLE_RECONNECT_REQUIRED",
          "Google spreadsheet access has expired. Reconnect Google and try again.",
        );
      }
      throw error;
    }

    const nextCredentials = {
      ...credentials,
      ...refreshed,
      refresh_token: refreshed.refresh_token || credentials.refresh_token,
      scope: refreshed.scope || credentials.scope,
    };
    const { error } = await supabase
      .from("email_connections")
      .update({ credentials: encryptJson(nextCredentials) })
      .eq("id", connection.id)
      .eq("project_id", connection.project_id);
    if (error) throw error;
    client.setCredentials(nextCredentials);
  }

  return client;
}

export async function getSheetMetadata(sheetsApi, spreadsheetId, sheetId) {
  const { data } = await sheetsApi.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title,index))",
  });
  const sheet = (data.sheets || []).find(
    ({ properties }) => Number(properties?.sheetId) === Number(sheetId),
  );
  if (!sheet?.properties?.title) {
    throw new GoogleSheetsAccessError(404, "SHEET_NOT_FOUND", "That sheet tab is no longer available.");
  }
  return sheet.properties;
}

const quoteSheetTitle = (title) => `'${String(title).replace(/'/g, "''")}'`;

function columnRange(title, column, startRow, endRow) {
  return `${quoteSheetTitle(title)}!${column}${startRow}:${column}${endRow || ""}`;
}

export async function getSpreadsheetColumns(sheetsApi, spreadsheetId, sheetId, headerRow) {
  const sheet = await getSheetMetadata(sheetsApi, spreadsheetId, sheetId);
  const { data } = await sheetsApi.spreadsheets.values.get({
    spreadsheetId,
    range: `${quoteSheetTitle(sheet.title)}!${headerRow}:${headerRow}`,
    majorDimension: "ROWS",
  });
  const headers = data.values?.[0] || [];
  return headers.map((header, index) => {
    const letter = columnLetter(index);
    const value = String(header ?? "").trim();
    return {
      letter,
      header: value || `Column ${letter}`,
    };
  });
}

export async function listAccessibleSpreadsheets(driveApi) {
  const files = [];
  let pageToken;
  do {
    const { data } = await driveApi.files.list({
      q: "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
      fields: "nextPageToken,files(id,name)",
      orderBy: "name",
      pageSize: 1000,
      spaces: "drive",
      ...(pageToken ? { pageToken } : {}),
    });
    files.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
}

export async function readSpreadsheetRecipients(sheetsApi, spreadsheetId, plan) {
  const sheet = await getSheetMetadata(sheetsApi, spreadsheetId, plan.sheet.id);
  const columns = [...new Set([plan.emailColumn, ...Object.values(plan.variableColumns || {})])];
  if (columns.some((column) => !isColumnLetter(column))) {
    throw new GoogleSheetsAccessError(400, "INVALID_COLUMN", "The spreadsheet column selection is invalid.");
  }

  const ranges = columns.map((column) =>
    columnRange(sheet.title, column, plan.startRow, plan.endRow),
  );
  const { data } = await sheetsApi.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges,
    majorDimension: "ROWS",
  });
  const valueRanges = data.valueRanges || [];
  const valuesByColumn = new Map(columns.map((column, index) => [
    column,
    valueRanges[index]?.values || [],
  ]));
  const emailValues = valuesByColumn.get(plan.emailColumn) || [];
  const requestedRowCount = plan.endRow
    ? plan.endRow - plan.startRow + 1
    : emailValues.length;
  const recipients = [];

  for (let offset = 0; offset < requestedRowCount; offset += 1) {
    const email = String(emailValues[offset]?.[0] ?? "").trim().toLowerCase();
    if (!email) continue;

    recipients.push({
      rowNumber: plan.startRow + offset,
      email,
      values: Object.fromEntries(
        Object.entries(plan.variableColumns || {}).map(([name, column]) => [
          name,
          String(valuesByColumn.get(column)?.[offset]?.[0] ?? ""),
        ]),
      ),
    });

    if (recipients.length > MAX_SHEET_RECIPIENTS) {
      const error = new GoogleSheetsAccessError(
        400,
        "SHEET_RECIPIENT_LIMIT",
        `This range contains more than ${MAX_SHEET_RECIPIENTS} recipients. Narrow the selected rows and try again.`,
      );
      error.permanent = true;
      throw error;
    }
  }

  return recipients;
}
