import { google } from "googleapis";

import { cleanEmailHtml, cleanPlainText } from "./emailBodyCleaner.js";
import { isValidEmail, LIMITS } from "./scheduleValidation.js";
import { getGoogleSheetsClient, readSpreadsheetRecipients } from "./googleSheetsService.js";
import { renderSheetTemplate } from "./sheetTemplate.js";

export async function buildSpreadsheetMessages(connection, config) {
  const client = await getGoogleSheetsClient(connection);
  const sheetsApi = google.sheets({ version: "v4", auth: client });
  const plan = config.spreadsheet;
  const rows = await readSpreadsheetRecipients(sheetsApi, plan.file.id, plan);
  const messages = [];
  const failures = [];

  for (const row of rows) {
    if (!isValidEmail(row.email)) {
      failures.push({
        to: `Row ${row.rowNumber}`,
        reason: "The recipient email address is invalid.",
      });
      continue;
    }

    try {
      const subject = renderSheetTemplate(config.subject, row.values);
      const rawBody = renderSheetTemplate(config.body, row.values, {
        html: config.body_type === "html",
      });
      const body = config.body_type === "html"
        ? cleanEmailHtml(rawBody)
        : cleanPlainText(rawBody);

      if (!subject.trim() || subject.length > LIMITS.MAX_SUBJECT || /[\u0000-\u001f\u007f]/.test(subject)) {
        throw new Error("The rendered subject is empty, too long, or contains a line break.");
      }
      if (!body || Buffer.byteLength(body, "utf8") > LIMITS.MAX_BODY_BYTES) {
        throw new Error("The rendered message is empty or too large.");
      }

      messages.push({
        recipients: [row.email],
        subject,
        body,
        body_type: config.body_type,
      });
    } catch (error) {
      failures.push({
        to: row.email,
        reason: `Row ${row.rowNumber}: ${error.message}`,
      });
    }
  }

  if (!messages.length) {
    const error = new Error(
      failures.length
        ? "No valid spreadsheet rows could be sent."
        : "No recipient email addresses were found in the selected rows.",
    );
    error.permanent = true;
    error.failures = failures;
    throw error;
  }

  return { messages, failures };
}
