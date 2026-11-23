import assert from "node:assert/strict";
import { test } from "node:test";

process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY ||= "test-service-role-key";

const {
  GoogleSheetsAccessError,
  MAX_SHEET_RECIPIENTS,
  createSpreadsheetWithHeaders,
  normalizeGoogleSheetsError,
  readSpreadsheetRecipients,
} = await import("../services/googleSheetsService.js");

function createSheetsApi(valueRanges) {
  let requestedRanges;
  return {
    api: {
      spreadsheets: {
        get: async () => ({
          data: {
            sheets: [{ properties: { sheetId: 0, title: "Client's data" } }],
          },
        }),
        values: {
          batchGet: async (request) => {
            requestedRanges = request.ranges;
            return { data: { valueRanges } };
          },
        },
      },
    },
    get requestedRanges() {
      return requestedRanges;
    },
  };
}

test("new spreadsheets create a Recipients tab and write template headers as raw values", async () => {
  const requests = [];
  const headers = [" Email ", "first_name", ...Array.from({ length: 28 }, (_, index) => `field_${index}`)];
  const sheetsApi = {
    spreadsheets: {
      create: async (request) => {
        requests.push({ operation: "create", request });
        return {
          data: {
            spreadsheetId: "spreadsheet_123",
            spreadsheetUrl: "https://docs.google.com/spreadsheets/d/spreadsheet_123/edit",
            properties: { title: "Welcome recipients" },
            sheets: [{ properties: { sheetId: 0, title: "Recipients" } }],
          },
        };
      },
      values: {
        update: async (request) => requests.push({ operation: "update", request }),
      },
    },
  };

  const result = await createSpreadsheetWithHeaders(
    sheetsApi,
    "Welcome recipients",
    headers,
  );

  assert.deepEqual(result, {
    id: "spreadsheet_123",
    name: "Welcome recipients",
    url: "https://docs.google.com/spreadsheets/d/spreadsheet_123/edit",
    sheet: { id: "0", title: "Recipients" },
  });
  assert.equal(requests[0].request.requestBody.sheets[0].properties.title, "Recipients");
  assert.equal(requests[0].request.requestBody.sheets[0].properties.gridProperties.columnCount, 30);
  assert.deepEqual(requests[1].request.requestBody.values, [headers.map((header) => header.trim())]);
  assert.equal(requests[1].request.valueInputOption, "RAW");
});

test("spreadsheet rows map selected columns and preserve original row numbers", async () => {
  const sheets = createSheetsApi([
    { values: [["ADA@EXAMPLE.COM"], [""], ["bad"], ["grace@example.com"]] },
    { values: [["Ada"], ["Ignored"], ["Linus"], ["Grace"]] },
  ]);
  const recipients = await readSpreadsheetRecipients(sheets.api, "spreadsheet_123", {
    sheet: { id: "0" },
    startRow: 2,
    endRow: null,
    emailColumn: "A",
    variableColumns: { first_name: "B" },
  });

  assert.deepEqual(sheets.requestedRanges, [
    "'Client''s data'!A2:A",
    "'Client''s data'!B2:B",
  ]);
  assert.deepEqual(recipients, [
    { rowNumber: 2, email: "ada@example.com", values: { first_name: "Ada" } },
    { rowNumber: 4, email: "bad", values: { first_name: "Linus" } },
    { rowNumber: 5, email: "grace@example.com", values: { first_name: "Grace" } },
  ]);
});

test("spreadsheet row reading fails permanently above its recipient safety limit", async () => {
  const sheets = createSheetsApi([
    { values: Array.from({ length: MAX_SHEET_RECIPIENTS + 1 }, (_, index) => [`person${index}@example.com`]) },
  ]);

  await assert.rejects(
    readSpreadsheetRecipients(sheets.api, "spreadsheet_123", {
      sheet: { id: "0" },
      startRow: 2,
      endRow: null,
      emailColumn: "A",
      variableColumns: {},
    }),
    (error) => error.code === "SHEET_RECIPIENT_LIMIT" && error.permanent === true,
  );
});

test("Google permission errors are actionable without disguising other API errors", () => {
  const permissionError = normalizeGoogleSheetsError({
    response: {
      status: 403,
      data: { error: { errors: [{ reason: "forbidden" }] } },
    },
  });
  assert.equal(permissionError.code, "SHEET_ACCESS_DENIED");
  assert.equal(permissionError.permanent, true);

  const quotaError = { response: { status: 429 }, message: "Rate limit exceeded" };
  assert.equal(normalizeGoogleSheetsError(quotaError), quotaError);

  const missingTab = new GoogleSheetsAccessError(404, "SHEET_NOT_FOUND", "That sheet tab is no longer available.");
  assert.equal(normalizeGoogleSheetsError(missingTab), missingTab);
});
