import { supabase } from "../config/supabase.js";

const ALLOWED_JOB_TYPES = new Set([
  "email",
]);

const ALLOWED_SCHEDULE_TYPES = new Set([
  "one_time",
  "recurring",
]);

const ALLOWED_STATUSES = new Set([
  "active",
]);

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_RECIPIENTS = 50;
const MAX_SUBJECT_LENGTH = 300;
const MAX_BODY_LENGTH = 100_000;

function assertString(
  value,
  field,
  maxLength
) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new Error(
      `${field} is required.`
    );
  }

  if (value.length > maxLength) {
    throw new Error(
      `${field} is too long.`
    );
  }
}

function normalizeRecipients(
  recipients
) {
  if (!Array.isArray(recipients)) {
    throw new Error(
      "config.recipients must be an array."
    );
  }

  if (
    recipients.length === 0
  ) {
    throw new Error(
      "At least one recipient is required."
    );
  }

  if (
    recipients.length >
    MAX_RECIPIENTS
  ) {
    throw new Error(
      `A maximum of ${MAX_RECIPIENTS} recipients is allowed.`
    );
  }

  const normalized =
    recipients.map((email) => {
      if (
        typeof email !== "string"
      ) {
        throw new Error(
          "Every recipient must be an email address."
        );
      }

      const value =
        email
          .trim()
          .toLowerCase();

      if (
        !EMAIL_REGEX.test(value)
      ) {
        throw new Error(
          `Invalid recipient email: ${email}`
        );
      }

      return value;
    });

  return [
    ...new Set(normalized),
  ];
}

function validateEmailConfig(
  config
) {
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config)
  ) {
    throw new Error(
      "Email config is required."
    );
  }

  const {
    recipients,
    subject,
    body,
    body_type,
  } = config;

  const normalizedRecipients =
    normalizeRecipients(
      recipients
    );

  assertString(
    subject,
    "Email subject",
    MAX_SUBJECT_LENGTH
  );

  assertString(
    body,
    "Email body",
    MAX_BODY_LENGTH
  );

  if (
    body_type !== "text" &&
    body_type !== "html"
  ) {
    throw new Error(
      "body_type must be either text or html."
    );
  }

  return {
    recipients:
      normalizedRecipients,

    subject:
      subject.trim(),

    body,

    body_type,
  };
}

function validateTimezone(
  timezone
) {
  if (
    typeof timezone !== "string" ||
    timezone.trim().length === 0
  ) {
    throw new Error(
      "Timezone is required."
    );
  }

  try {
    Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          timezone,
      }
    );
  } catch {
    throw new Error(
      "Invalid IANA timezone."
    );
  }

  return timezone.trim();
}

function calculateOneTimeNextRun(
  scheduledFor
) {
  if (
    typeof scheduledFor !==
      "string" ||
    !scheduledFor
  ) {
    throw new Error(
      "scheduled_for is required for a one-time schedule."
    );
  }

  const date =
    new Date(scheduledFor);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw new Error(
      "scheduled_for must be a valid ISO date."
    );
  }

  if (
    date.getTime() <=
    Date.now()
  ) {
    throw new Error(
      "scheduled_for must be in the future."
    );
  }

  return date.toISOString();
}

function validateRecurringExpression(
  expression
) {
  if (
    typeof expression !==
      "string" ||
    expression.trim().length === 0
  ) {
    throw new Error(
      "schedule_expression is required for a recurring schedule."
    );
  }

  if (
    expression.length > 100
  ) {
    throw new Error(
      "schedule_expression is too long."
    );
  }

  /*
   * Phase 1 accepts a standard
   * five-field cron expression.
   *
   * Examples:
   *
   * Every minute:
   * * * * *
   *
   * Every hour:
   * 0 * * * *
   *
   * Every day at 9 AM:
   * 0 9 * * *
   *
   * Every Monday at 9 AM:
   * 0 9 * * 1
   */

  const fields =
    expression
      .trim()
      .split(/\s+/);

  if (
    fields.length !== 5
  ) {
    throw new Error(
      "Recurring schedule must use a five-field cron expression."
    );
  }

  return expression.trim();
}

export const scheduleService = {

  async getSchedules(
    userId
  ) {
    const {
      data,
      error,
    } = await supabase
      .from("schedules")
      .select(`
        id,
        job_type,
        status,
        schedule_expression,
        timezone,
        config,
        scheduled_for,
        next_run_at,
        last_run_at,
        run_count,
        retry_count,
        last_failure_reason,
        created_at,
        updated_at,
        schedule_type
      `)
      .eq(
        "user_id",
        userId
      )
      .order(
        "next_run_at",
        {
          ascending: true,
          nullsFirst: false,
        }
      );

    if (error) {
      throw error;
    }

    return data;
  },

  async createSchedule(
    userId,
    input
  ) {

    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input)
    ) {
      throw new Error(
        "Invalid schedule payload."
      );
    }

    const {
      job_type,
      schedule_type,
      schedule_expression,
      timezone,
      config,
      scheduled_for,
    } = input;

    /*
     * ----------------------------------
     * JOB TYPE
     * ----------------------------------
     */

    if (
      !ALLOWED_JOB_TYPES.has(
        job_type
      )
    ) {
      throw new Error(
        "Unsupported job type."
      );
    }

    /*
     * ----------------------------------
     * SCHEDULE TYPE
     * ----------------------------------
     */

    if (
      !ALLOWED_SCHEDULE_TYPES.has(
        schedule_type
      )
    ) {
      throw new Error(
        "schedule_type must be one_time or recurring."
      );
    }

    /*
     * ----------------------------------
     * TIMEZONE
     * ----------------------------------
     */

    const normalizedTimezone =
      validateTimezone(
        timezone
      );

    /*
     * ----------------------------------
     * EMAIL CONFIG
     * ----------------------------------
     */

    const normalizedConfig =
      validateEmailConfig(
        config
      );

    /*
     * ----------------------------------
     * CALCULATE NEXT RUN
     * ----------------------------------
     */

    let nextRunAt =
      null;

    let normalizedScheduledFor =
      null;

    let normalizedExpression =
      null;

    if (
      schedule_type ===
      "one_time"
    ) {

      normalizedScheduledFor =
        calculateOneTimeNextRun(
          scheduled_for
        );

      nextRunAt =
        normalizedScheduledFor;

    }

    if (
      schedule_type ===
      "recurring"
    ) {

      normalizedExpression =
        validateRecurringExpression(
          schedule_expression
        );

      /*
       * We deliberately do NOT
       * trust next_run_at from
       * the browser.
       *
       * The scheduler worker will
       * calculate the actual next
       * occurrence from the cron
       * expression.
       *
       * For now we leave it null
       * until the cron calculation
       * service is connected.
       */
      nextRunAt = null;
    }

    /*
     * ----------------------------------
     * DATABASE INSERT
     * ----------------------------------
     *
     * Notice what is NOT here:
     *
     * user_id from frontend
     * status from frontend
     * run_count
     * retry_count
     * next_run_at
     * last_run_at
     *
     * Backend owns those values.
     */

    const {
      data,
      error,
    } = await supabase
      .from("schedules")
      .insert({
        user_id:
          userId,

        job_type:
          job_type,

        status:
          "active",

        schedule_expression:
          normalizedExpression,

        timezone:
          normalizedTimezone,

        config:
          normalizedConfig,

        scheduled_for:
          normalizedScheduledFor,

        next_run_at:
          nextRunAt,

        schedule_type:
          schedule_type,
      })
      .select(`
        id,
        job_type,
        status,
        schedule_expression,
        timezone,
        config,
        scheduled_for,
        next_run_at,
        last_run_at,
        run_count,
        retry_count,
        last_failure_reason,
        created_at,
        updated_at,
        schedule_type
      `)
      .single();

    if (error) {
      throw error;
    }

    return data;
  },
};