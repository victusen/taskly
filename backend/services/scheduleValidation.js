import { DateTime } from "luxon";

import { cleanEmailHtml, cleanPlainText } from "./emailBodyCleaner.js";

import {
  ONE_TIME,
  RECURRING,
  computeNextRun,
  isValidTimezone,
  parseRule,
} from "./scheduleRule.js";

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const LIMITS = {
  MAX_RECIPIENTS: 50,
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

/*
 * Whitelist validation. Only the fields read below can ever reach the database.
 * user_id, status, run_count, retry_count, next_run_at and last_run_at are owned by the backend.
 * Throws ValidationError listing every bad field, not just the first.
 */
export function validateScheduleInput(input, now = new Date()) {
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

  if (name.length > LIMITS.MAX_NAME || CONTROL_CHARS.test(name)) {
    errors.name = `Name must be ${LIMITS.MAX_NAME} characters or fewer.`;
  }

  const timezone =
    typeof input.timezone === "string" ? input.timezone.trim() : "";

  if (!isValidTimezone(timezone)) {
    errors.timezone = "That timezone is not recognised.";
  }

  let recipients = [];

  if (!Array.isArray(config.recipients) || config.recipients.length === 0) {
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

  const subject =
    typeof config.subject === "string" ? config.subject.trim() : "";

  if (!subject) {
    errors.subject = "Add a subject.";
  } else if (subject.length > LIMITS.MAX_SUBJECT) {
    errors.subject = `Subject must be ${LIMITS.MAX_SUBJECT} characters or fewer.`;
  } else if (CONTROL_CHARS.test(subject)) {
    errors.subject = "Subject cannot contain line breaks.";
  }

  /* HTML from the editor is cleaned here before anything is stored. */
  const bodyType = String(config.body_type || "html");

  if (!ALLOWED_BODY_TYPES.has(bodyType)) {
    errors.body_type = "Choose plain text or HTML.";
  }

  const rawBody = typeof config.body === "string" ? config.body : "";
  const body =
    bodyType === "html" ? cleanEmailHtml(rawBody) : cleanPlainText(rawBody);

  if (!body) {
    errors.body = "Write the message.";
  } else if (Buffer.byteLength(body, "utf8") > LIMITS.MAX_BODY_BYTES) {
    errors.body = "This message is too large. Shorten it or remove images.";
  }

  /* When. scheduled_for arrives as local wall time ("2026-10-19T09:00") and is read in the user's timezone. */
  const storedType = requestedType === RECURRING ? RECURRING : ONE_TIME;
  let first = null;

  if (requestedType === "immediate") {
    first = DateTime.fromJSDate(now);
  } else if (REQUESTED_TYPES.has(requestedType) && !errors.timezone) {
    const raw =
      typeof input.scheduled_for === "string"
        ? input.scheduled_for.trim()
        : "";

    if (!raw || raw.length > 40) {
      errors.scheduled_for = "Pick the date and time.";
    } else {
      const parsed = DateTime.fromISO(raw, { zone: timezone });

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
    config: { recipients, subject, body, body_type: bodyType },
  };
}