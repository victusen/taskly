import { DateTime } from "luxon";

import { cleanEmailHtml, cleanPlainText } from "./emailBodyCleaner.js";

import {
  ONE_TIME,
  RECURRING,
  computeNextRun,
  parseRule,
} from "./scheduleRule.js";
import { inspectTemplateVariables } from "./sheetTemplate.js";

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const LIMITS = {
  MAX_RECIPIENTS: 50,
  MAX_SHEET_RECIPIENTS: 500,
  MAX_SUBJECT: 300,
  /* Gmail clips messages above about 102 KB. Measured in bytes, not characters. */
  MAX_BODY_BYTES: 102_000,
  MAX_NAME: 120,
  MIN_LEAD_SECONDS: 60,
  MAX_YEARS_AHEAD: 5,
};

const ALLOWED_JOB_TYPES = new Set(["email"]);
const ALLOWED_BODY_TYPES = new Set(["text", "html"]);
const REQUESTED_TYPES = new Set(["immediate", ONE_TIME, RECURRING]);

const EMAIL =
  /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const SPREADSHEET_ID = /^[A-Za-z0-9_-]{1,256}$/;
const COLUMN_LETTER = /^[A-Z]{1,3}$/;
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isValidSheetColumn(value) {
  if (!COLUMN_LETTER.test(value)) return false;
  const index = [...value].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
  return index <= 16_384;
}

export class ValidationError extends Error {
  constructor(fieldErrors) {
    super("Please fix the highlighted fields.");
    this.name = "ValidationError";
    this.status = 400;
    this.code = "VALIDATION_FAILED";
    this.fieldErrors = fieldErrors;
  }
}

export function isValidEmail(value) {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    EMAIL.test(value) &&
    value.split(".").pop().length >= 2
  );
}

function validateSpreadsheetPlan(value, subject, body, scheduleType, errors, allowImmediate = false) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.spreadsheet = "Choose a valid spreadsheet setup.";
    return null;
  }

  const fileId = String(value.file?.id || "");
  const sheetId = String(value.sheet?.id ?? "");
  const headerRow = Number(value.headerRow);
  const startRow = Number(value.startRow);
  const endRow = value.endRow === null || value.endRow === undefined || value.endRow === ""
    ? null
    : Number(value.endRow);
  const emailColumn = String(value.emailColumn || "");
  const variableColumns = value.variableColumns;
  let valid = true;

  if (!SPREADSHEET_ID.test(fileId)) {
    errors.spreadsheet = "Choose a valid spreadsheet.";
    valid = false;
  }
  if (!/^\d{1,10}$/.test(sheetId)) {
    errors.spreadsheet = "Choose a valid sheet tab.";
    valid = false;
  }
  if (
    !Number.isSafeInteger(headerRow) ||
    !Number.isSafeInteger(startRow) ||
    headerRow < 1 ||
    headerRow >= startRow ||
    startRow > 1_000_000 ||
    (endRow !== null && (
      !Number.isSafeInteger(endRow) ||
      endRow < startRow ||
      endRow > 1_000_000 ||
      endRow - startRow + 1 > LIMITS.MAX_SHEET_RECIPIENTS
    ))
  ) {
    errors.spreadsheet = `Choose a header row and a data range of at most ${LIMITS.MAX_SHEET_RECIPIENTS} rows.`;
    valid = false;
  }
  if (!isValidSheetColumn(emailColumn)) {
    errors.spreadsheet = "Choose the spreadsheet column containing recipient email addresses.";
    valid = false;
  }
  if (!variableColumns || typeof variableColumns !== "object" || Array.isArray(variableColumns)) {
    errors.spreadsheet = "Choose valid spreadsheet variable columns.";
    valid = false;
  } else {
    const entries = Object.entries(variableColumns);
    if (entries.length > 100 || entries.some(([name, column]) =>
      !VARIABLE_NAME.test(name) || !isValidSheetColumn(String(column || ""))
    )) {
      errors.spreadsheet = "Spreadsheet variables must use valid names and column letters.";
      valid = false;
    }

    const templateVariables = inspectTemplateVariables(subject, body);
    const missing = templateVariables.filter((name) => !Object.hasOwn(variableColumns, name));
    if (missing.length) {
      errors.spreadsheet = `Choose a spreadsheet column for ${missing.map((name) => `{${name}}`).join(", ")}.`;
      valid = false;
    }
    const unused = entries
      .map(([name]) => name)
      .filter((name) => !templateVariables.includes(name));
    if (unused.length) {
      errors.spreadsheet = `Use each selected variable in the subject or email body: ${unused.map((name) => `{${name}}`).join(", ")}.`;
      valid = false;
    }
  }

  if (scheduleType === "immediate" && !allowImmediate) {
    errors.spreadsheet = "Spreadsheet sends must be scheduled for a date and time.";
    valid = false;
  }

  if (!valid) return null;
  return {
    version: 1,
    provider: "google_sheets",
    file: {
      id: fileId,
      name: typeof value.file.name === "string" ? value.file.name.slice(0, 300) : "",
    },
    sheet: {
      id: sheetId,
      title: typeof value.sheet.title === "string" ? value.sheet.title.slice(0, 300) : "",
    },
    headerRow,
    startRow,
    endRow,
    emailColumn,
    variableColumns: Object.fromEntries(
      Object.entries(variableColumns).map(([name, column]) => [name, String(column)]),
    ),
  };
}

/*
 * Whitelist validation. Only the fields read below can ever reach the database.
 * status, run_count, retry_count, next_run_at and last_run_at are owned by the backend.
 * Throws ValidationError listing every bad field, not just the first.
 */
export function validateScheduleInput(input, now = new Date(), { allowImmediateSpreadsheet = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ValidationError({ _form: "Invalid schedule payload." });
  }

  const errors = {};

  const config =
    input.config &&
    typeof input.config === "object" &&
    !Array.isArray(input.config)
      ? input.config
      : {};

  const jobType = String(input.job_type || "email");

  if (!ALLOWED_JOB_TYPES.has(jobType)) {
    errors.job_type = "Only email schedules are available right now.";
  }

  /* "immediate" is a convenience: it is stored as a one_time run starting now. */
  const requestedType = String(input.schedule_type || "");

  if (!REQUESTED_TYPES.has(requestedType)) {
    errors.schedule_type = "Choose send now, one time, or repeating.";
  }

  const projectId = String(input.project_id || "");

  if (!UUID_PATTERN.test(projectId)) {
    errors.project_id = "Open a project first.";
  }

  const connectionId = String(input.email_connection_id || "");

  if (!UUID_PATTERN.test(connectionId)) {
    errors.email_connection_id = "Choose the mail account to send from.";
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";

  if (!name) {
    errors.name = "Add a schedule name.";
  } else if (name.length > LIMITS.MAX_NAME || CONTROL_CHARS.test(name)) {
    errors.name = `Name must be ${LIMITS.MAX_NAME} characters or fewer.`;
  }

  const timezone = "UTC";

  const rawSubject =
    typeof config.subject === "string" ? config.subject.trim() : "";
  const rawBody = typeof config.body === "string" ? config.body : "";
  const bodyType = String(config.body_type || "html");
  const body =
    bodyType === "html" ? cleanEmailHtml(rawBody) : cleanPlainText(rawBody);
  const spreadsheet = validateSpreadsheetPlan(
    config.spreadsheet,
    rawSubject,
    body,
    requestedType,
    errors,
    allowImmediateSpreadsheet,
  );

  let recipients = [];

  if (!Array.isArray(config.recipients)) {
    errors.recipients = "Add recipients or choose spreadsheet recipients.";
  } else if (spreadsheet && config.recipients.length > 0) {
    errors.recipients = "Choose either direct recipients or spreadsheet recipients, not both.";
  } else if (config.recipients.length === 0 && !spreadsheet) {
    errors.recipients = "Add at least one recipient.";
  } else if (config.recipients.length > LIMITS.MAX_RECIPIENTS) {
    errors.recipients = `A maximum of ${LIMITS.MAX_RECIPIENTS} recipients is allowed.`;
  } else {
    recipients = [
      ...new Set(
        config.recipients.map((email) =>
          typeof email === "string" ? email.trim().toLowerCase() : ""
        )
      ),
    ];

    const bad = recipients.find((email) => !isValidEmail(email));

    if (bad !== undefined) {
      errors.recipients = `"${bad.slice(0, 60)}" is not a valid email address.`;
    }
  }

  const subject = rawSubject;

  if (!subject) {
    errors.subject = "Add a subject.";
  } else if (subject.length > LIMITS.MAX_SUBJECT) {
    errors.subject = `Subject must be ${LIMITS.MAX_SUBJECT} characters or fewer.`;
  } else if (CONTROL_CHARS.test(subject)) {
    errors.subject = "Subject cannot contain line breaks.";
  }

  /* HTML from the editor is cleaned here before anything is stored. */
  if (!ALLOWED_BODY_TYPES.has(bodyType)) {
    errors.body_type = "Choose plain text or HTML.";
  }

  if (!body) {
    errors.body = "Write the message.";
  } else if (Buffer.byteLength(body, "utf8") > LIMITS.MAX_BODY_BYTES) {
    errors.body = "This message is too large. Shorten it or remove images.";
  }

  /* The frontend sends wall-clock fields interpreted as UTC. */
  const storedType = requestedType === RECURRING ? RECURRING : ONE_TIME;
  let first = null;

  if (requestedType === "immediate") {
    first = DateTime.fromJSDate(now);
  } else if (REQUESTED_TYPES.has(requestedType)) {
    const raw =
      typeof input.scheduled_for === "string"
        ? input.scheduled_for.trim()
        : "";

    if (!raw || raw.length > 40) {
      errors.scheduled_for = "Pick the date and time.";
    } else {
      const parsed = DateTime.fromISO(raw, { zone: "UTC" });

      if (!parsed.isValid) {
        errors.scheduled_for = "That date and time is not valid.";
      } else if (
        parsed.toMillis() <
        now.getTime() + LIMITS.MIN_LEAD_SECONDS * 1000
      ) {
        errors.scheduled_for = "Pick a time at least a minute from now.";
      } else if (
        parsed > DateTime.fromJSDate(now).plus({ years: LIMITS.MAX_YEARS_AHEAD })
      ) {
        errors.scheduled_for = `Pick a date within ${LIMITS.MAX_YEARS_AHEAD} years.`;
      } else {
        first = parsed;
      }
    }
  }

  let rule = null;

  if (requestedType === RECURRING) {
    const parsedRule = parseRule(input.schedule_rule);

    if (parsedRule.error) {
      errors.schedule_rule = parsedRule.error;
    } else {
      rule = parsedRule.rule;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError(errors);
  }

  const scheduledForUtc = first.toUTC().toISO();

  const nextRunAt =
    requestedType === "immediate"
      ? scheduledForUtc
      : computeNextRun(
          {
            schedule_type: storedType,
            scheduled_for: scheduledForUtc,
            schedule_rule: rule,
            timezone,
          },
          now
        );

  if (!nextRunAt) {
    throw new ValidationError({
      scheduled_for: "That schedule never runs. Pick a later time.",
    });
  }

  return {
    name: name || null,
    project_id: projectId,
    job_type: jobType,
    schedule_type: storedType,
    schedule_rule: rule,
    timezone,
    scheduled_for: scheduledForUtc,
    next_run_at: nextRunAt,
    email_connection_id: connectionId,
    config: {
      recipients,
      subject,
      body,
      body_type: bodyType,
      ...(spreadsheet ? { spreadsheet } : {}),
    },
  };
}