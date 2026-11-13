import assert from "node:assert/strict";
import { test } from "node:test";

import { validateScheduleInput } from "../services/scheduleValidation.js";
import { renderSheetTemplate } from "../services/sheetTemplate.js";

const now = new Date("2025-01-01T00:00:00.000Z");
const validPayload = () => ({
  project_id: "11111111-1111-4111-8111-111111111111",
  email_connection_id: "22222222-2222-4222-8222-222222222222",
  name: "January update",
  schedule_type: "one_time",
  scheduled_for: "2025-01-02T09:00:00",
  config: {
    recipients: [],
    subject: "Hello {first_name}",
    body: "<p>Your balance is {balance + 5}</p>",
    body_type: "html",
    spreadsheet: {
      file: { id: "spreadsheet_123", name: "Clients" },
      sheet: { id: "0", title: "Sheet1" },
      headerRow: 1,
      startRow: 2,
      endRow: null,
      emailColumn: "A",
      variableColumns: { first_name: "B", balance: "C" },
    },
  },
});

test("valid spreadsheet schedules preserve selected columns and allow 500 recipients", () => {
  const result = validateScheduleInput(validPayload(), now);

  assert.deepEqual(result.config.recipients, []);
  assert.equal(result.config.spreadsheet.emailColumn, "A");
  assert.deepEqual(result.config.spreadsheet.variableColumns, {
    first_name: "B",
    balance: "C",
  });
  assert.equal(result.config.spreadsheet.endRow, null);
});

test("spreadsheet schedules require mappings for every template variable", () => {
  const payload = validPayload();
  delete payload.config.spreadsheet.variableColumns.balance;

  assert.throws(
    () => validateScheduleInput(payload, now),
    (error) => Boolean(error.fieldErrors.spreadsheet),
  );
});

test("spreadsheet schedules reject mixed direct recipients, oversized ranges, and send-now", () => {
  const mixed = validPayload();
  mixed.config.recipients = ["person@example.com"];
  assert.throws(() => validateScheduleInput(mixed, now), (error) => Boolean(error.fieldErrors.recipients));

  const oversized = validPayload();
  oversized.config.spreadsheet.endRow = 502;
  assert.throws(() => validateScheduleInput(oversized, now), (error) => Boolean(error.fieldErrors.spreadsheet));

  const immediate = validPayload();
  immediate.schedule_type = "immediate";
  delete immediate.scheduled_for;
  assert.throws(() => validateScheduleInput(immediate, now), (error) => Boolean(error.fieldErrors.spreadsheet));
  assert.doesNotThrow(() => validateScheduleInput(immediate, now, { allowImmediateSpreadsheet: true }));
});

test("spreadsheet substitutions escape HTML values and evaluate arithmetic safely", () => {
  assert.equal(
    renderSheetTemplate("<p>{first_name}: {balance + 5}</p>", {
      first_name: "<script>",
      balance: "7",
    }, { html: true }),
    "<p>&lt;script&gt;: 12</p>",
  );
  assert.throws(
    () => renderSheetTemplate("{balance / 0}", { balance: "7" }),
    /divide by zero/,
  );
});
