import { authenticatedFetch } from "../auth/api.js";

function queryString(params) {
  return new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));
}

function assertProject(projectId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(projectId || ""))) {
    throw new Error("Choose a valid project before connecting a spreadsheet.");
  }
}

export async function startGoogleSheetsConnection(projectId) {
  assertProject(projectId);
  const body = await authenticatedFetch(
    `/api/google-sheets/oauth/start?${queryString({ project_id: projectId })}`,
    { method: "GET" },
  );
  if (!body.authorizationUrl) {
    throw new Error("Google Sheets authorization URL was not returned.");
  }
  window.location.href = body.authorizationUrl;
}

export async function listProjectScheduleDatabaseConnections(projectId) {
  assertProject(projectId);
  const body = await authenticatedFetch(`/api/google-sheets/connections?${queryString({ project_id: projectId })}`);
  if (!Array.isArray(body.data) || body.data.some((connection) => !connection?.id || !connection?.account_email)) {
    throw new Error("The Google Sheets connection response was invalid.");
  }
  return body.data;
}

export async function getGoogleSheetsPickerConfig(projectId, connectionId) {
  assertProject(projectId);
  if (!connectionId) throw new Error("Choose a Google Sheets connection first.");
  const body = await authenticatedFetch(
    `/api/google-sheets/picker-config?${queryString({ project_id: projectId, connection_id: connectionId })}`
  );
  if (!body.data?.apiKey || !body.data?.appId || !body.data?.accessToken) {
    throw new Error("Google Picker configuration was incomplete.");
  }
  return body.data;
}

export async function disconnectGoogleSheetsConnection(projectId, connectionId) {
  assertProject(projectId);
  if (!connectionId) throw new Error("Choose a Google Sheets connection to disconnect.");
  return authenticatedFetch(
    `/api/google-sheets/connections/${encodeURIComponent(connectionId)}?${queryString({ project_id: projectId })}`,
    { method: "DELETE" },
  );
}

export async function listSpreadsheetSheets(projectId, connectionId, spreadsheetId) {
  assertProject(projectId);
  if (!connectionId || !spreadsheetId) throw new Error("Choose a Google Sheets connection and spreadsheet first.");
  const body = await authenticatedFetch(
    `/api/google-sheets/${encodeURIComponent(spreadsheetId)}/sheets?${queryString({ project_id: projectId, connection_id: connectionId })}`
  );
  if (!Array.isArray(body.data) || body.data.some((sheet) => sheet?.id === undefined || typeof (sheet.title || sheet.name) !== "string")) {
    throw new Error("The sheet list response was invalid.");
  }
  return body.data.map((sheet) => ({ id: String(sheet.id), title: sheet.title || sheet.name }));
}

export async function listSpreadsheetColumns(projectId, connectionId, spreadsheetId, sheetId, headerRow) {
  assertProject(projectId);
  if (!connectionId || !spreadsheetId || !sheetId) throw new Error("Choose a Google Sheets connection, spreadsheet, and sheet first.");
  const body = await authenticatedFetch(
    `/api/google-sheets/${encodeURIComponent(spreadsheetId)}/columns?${queryString({
      project_id: projectId,
      connection_id: connectionId,
      sheet_id: sheetId,
      header_row: headerRow,
    })}`
  );
  if (!Array.isArray(body.data) || body.data.some((column) => {
    const letter = column?.letter || column?.id || column?.column;
    return typeof letter !== "string" || typeof (column.header || column.title) !== "string";
  })) {
    throw new Error("The spreadsheet column response was invalid.");
  }
  return body.data.map((column) => ({
    letter: column.letter || column.id || column.column,
    header: column.header || column.title,
  }));
}
