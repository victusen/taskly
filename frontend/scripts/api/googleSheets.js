import { authenticatedFetch } from "../auth/api.js";

function queryString(params) {
  return new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));
}

function assertProject(projectId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(projectId || ""))) {
    throw new Error("Choose a valid project before connecting a spreadsheet.");
  }
}

export async function listProjectSpreadsheets(projectId) {
  assertProject(projectId);
  const body = await authenticatedFetch(`/api/google-sheets/files?${queryString({ project_id: projectId })}`);
  if (!Array.isArray(body.data) || body.data.some((file) => !file?.id || typeof (file.name || file.title) !== "string")) {
    throw new Error("The spreadsheet list response was invalid.");
  }
  return body.data.map((file) => ({ id: String(file.id), name: file.name || file.title }));
}

export async function listSpreadsheetSheets(projectId, spreadsheetId) {
  assertProject(projectId);
  if (!spreadsheetId) throw new Error("Choose a spreadsheet first.");
  const body = await authenticatedFetch(
    `/api/google-sheets/${encodeURIComponent(spreadsheetId)}/sheets?${queryString({ project_id: projectId })}`
  );
  if (!Array.isArray(body.data) || body.data.some((sheet) => sheet?.id === undefined || typeof (sheet.title || sheet.name) !== "string")) {
    throw new Error("The sheet list response was invalid.");
  }
  return body.data.map((sheet) => ({ id: String(sheet.id), title: sheet.title || sheet.name }));
}

export async function listSpreadsheetColumns(projectId, spreadsheetId, sheetId, headerRow) {
  assertProject(projectId);
  if (!spreadsheetId || !sheetId) throw new Error("Choose a spreadsheet and sheet first.");
  const body = await authenticatedFetch(
    `/api/google-sheets/${encodeURIComponent(spreadsheetId)}/columns?${queryString({
      project_id: projectId,
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
