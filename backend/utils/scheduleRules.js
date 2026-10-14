import { DateTime, IANAZone } from "luxon";
import getCron from "get-cron";
import { CronExpressionParser } from "cron-parser";

/*
 * Everything about WHEN a schedule runs lives in this file.
 *
 * Stored in the database (no cron expression is ever stored):
 *   scheduled_for : the first run, a UTC instant
 *   timezone      : the user's zone, for example "Africa/Lagos"
 *   schedule_rule : the plain word the user picked, for example { "every": "weekday" }
 *
 * At run time:
 *   get-cron turns (first run, word) into a cron expression, for example "0 9 * * 1-5".
 *   cron-parser reads that expression in the user's timezone and returns the next date.
 *
 * To offer a new repeat word, add it to REPEAT_OPTIONS. get-cron must support it.
 */

export const ONE_TIME = "one_time";
export const RECURRING = "recurring";

export const REPEAT_OPTIONS = [
  "daily",
  "weekday",
  "weekends",
  "weekly",
  "monthly",
  "yearly",
];

export function isValidTimezone(zone) {
  return typeof zone === "string" && IANAZone.isValidZone(zone);
}

/* Returns { rule } (a clean copy) or { error } (a message the user can read). */
export function parseRule(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "Choose how the schedule repeats." };
  }

  if (typeof raw.every !== "string" || !REPEAT_OPTIONS.includes(raw.every)) {
    return { error: "That repeat option is not available." };
  }

  return { rule: { every: raw.every } };
}

/*
 * The cron expression for a rule, built from the wall clock time of the first run.
 * Example: first run 09:00 Lagos on a Monday, every "weekday" gives "0 9 * * 1-5".
 */
export function buildCronExpression({ scheduled_for, schedule_rule, timezone }) {
  const first = DateTime.fromISO(String(scheduled_for), { zone: "utc" }).setZone(timezone);

  if (!first.isValid) {
    return null;
  }

  return getCron({
    at: first.toFormat("yyyy-LL-dd'T'HH:mm"),
    every: schedule_rule.every,
  });
}

/*
 * The next run strictly after `after`, as a UTC ISO string, or null when there is none.
 * The worker calls this after every send. Runs missed while the worker was down are skipped.
 */
export function computeNextRun(
  { schedule_type, scheduled_for, schedule_rule, timezone },
  after = new Date()
) {
  const first = DateTime.fromISO(String(scheduled_for), { zone: "utc" });

  if (!first.isValid) {
    return null;
  }

  /* The first run has not happened yet: that is the next run, for both types. */
  if (first.toMillis() > after.getTime()) {
    return first.toUTC().toISO();
  }

  if (schedule_type === ONE_TIME) {
    return null;
  }

  if (
    schedule_type !== RECURRING ||
    !schedule_rule ||
    !REPEAT_OPTIONS.includes(schedule_rule.every)
  ) {
    return null;
  }

  try {
    const expression = buildCronExpression({ scheduled_for, schedule_rule, timezone });

    const next = CronExpressionParser.parse(expression, {
      tz: timezone,
      currentDate: after,
    }).next();

    return next.toDate().toISOString();
  } catch {
    return null;
  }
}