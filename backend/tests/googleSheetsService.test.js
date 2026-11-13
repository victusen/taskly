import assert from "node:assert/strict";
import { test } from "node:test";

process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY ||= "test-service-role-key";

const { readSpreadsheetRecipients } = await import("../services/googleSheetsService.js");

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

test("spreadsheet row reading fails permanently above 500 non-empty addresses", async () => {
  const sheets = createSheetsApi([
    { values: Array.from({ length: 501 }, (_, index) => [`person${index}@example.com`]) },
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
