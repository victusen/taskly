import { prepareGoogleSheetsRecipientSource } from "./recipientSources/googleSheetsRecipientSource.js";
import { prepareManualRecipientSource } from "./recipientSources/manualRecipientSource.js";

export async function dispatchRecipientSource(schedule) {
  const source = schedule.config?.recipient_source
    || (schedule.config?.spreadsheet
      ? { type: "database", provider: "google_sheets" }
      : { type: "manual" });

  if (source.type === "manual") {
    return prepareManualRecipientSource(schedule.config);
  }
  if (source.type === "database" && source.provider === "google_sheets") {
    return prepareGoogleSheetsRecipientSource(schedule, source);
  }

  const error = new Error("This schedule uses an unsupported recipient source.");
  error.code = "UNSUPPORTED_RECIPIENT_SOURCE";
  error.permanent = true;
  throw error;
}
