import { getScheduleDatabaseForExecution } from "../scheduleDatabaseService.js";
import { normalizeGoogleSheetsError } from "../googleSheetsService.js";
import { buildSpreadsheetMessages } from "../spreadsheetDelivery.js";

export async function prepareGoogleSheetsRecipientSource(schedule, source) {
  if (!source?.connection_id || !schedule.project_id || !schedule.config?.spreadsheet) {
    const error = new Error("Reconnect Google Sheets and update this schedule before it runs.");
    error.code = "SCHEDULE_DATABASE_RECONNECT_REQUIRED";
    error.permanent = true;
    throw error;
  }

  const connection = await getScheduleDatabaseForExecution(schedule.project_id, source.connection_id);
  try {
    const prepared = await buildSpreadsheetMessages(connection, schedule.config);
    return {
      type: "database",
      provider: "google_sheets",
      connectionId: connection.id,
      recipientCount: prepared.messages.reduce(
        (total, message) => total + message.recipients.length,
        0,
      ),
      messages: prepared.messages,
      failures: prepared.failures,
    };
  } catch (error) {
    const normalized = normalizeGoogleSheetsError(error);
    if (normalized.status === 409 || normalized.status === 400) normalized.permanent = true;
    throw normalized;
  }
}
