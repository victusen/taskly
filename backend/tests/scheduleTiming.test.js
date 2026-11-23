import assert from "node:assert/strict";
import { test } from "node:test";

import { validateScheduleInput } from "../services/scheduleValidation.js";
import {
  buildCronExpression,
  computeNextRun,
  ONE_TIME,
  RECURRING,
} from "../services/scheduleRule.js";
import { armCronAt, occurrenceKey, stopAll } from "../workers/scheduleQueue.js";
import { DateTime } from "luxon";

const now = new Date("2025-01-01T00:00:00.000Z");
const payload = (overrides = {}) => ({
  project_id: "11111111-1111-4111-8111-111111111111",
  email_connection_id: "22222222-2222-4222-8222-222222222222",
  name: "Timing test",
  schedule_type: "one_time",
  timezone: "America/Los_Angeles",
  scheduled_for: "2025-01-02T09:00:00",
  config: {
    recipients: ["person@example.com"],
    subject: "Hello",
    body: "Message",
    body_type: "text",
  },
  ...overrides,
});

test("schedule creation converts timezone wall time to a UTC instant", () => {
  const result = validateScheduleInput(payload(), now);

  assert.equal(result.timezone, "America/Los_Angeles");
  assert.equal(result.scheduled_for, "2025-01-02T17:00:00.000Z");
  assert.equal(result.next_run_at, result.scheduled_for);
});

test("schedule creation preserves a custom sender display name", () => {
  const result = validateScheduleInput(payload({
    config: {
      ...payload().config,
      sender_name: "Sam from Bzade",
    },
  }), now);

  assert.equal(result.config.sender_name, "Sam from Bzade");
});

test("schedule creation rejects sender names containing header line breaks", () => {
  assert.throws(
    () => validateScheduleInput(payload({
      config: {
        ...payload().config,
        sender_name: "Bzade\r\nBcc: other@example.com",
      },
    }), now),
    (error) => Boolean(error.fieldErrors.sender_name),
  );
});

test("schedule creation rejects unknown timezones", () => {
  assert.throws(
    () => validateScheduleInput(payload({ timezone: "Not/A_Timezone" }), now),
    (error) => Boolean(error.fieldErrors.timezone),
  );
});

test("send-now stores an immediate one-time occurrence", () => {
  const result = validateScheduleInput(payload({
    schedule_type: "immediate",
    scheduled_for: undefined,
  }), now);

  assert.equal(result.schedule_type, ONE_TIME);
  assert.equal(result.scheduled_for, now.toISOString());
  assert.equal(result.next_run_at, now.toISOString());
});

test("recurring schedules retain local wall time across daylight-saving changes", () => {
  const schedule = {
    schedule_type: RECURRING,
    scheduled_for: "2025-03-08T14:00:00.000Z",
    schedule_rule: { every: "daily" },
    timezone: "America/New_York",
  };
  assert.equal(buildCronExpression(schedule), "0 9 * * *");

  const next = computeNextRun({
    ...schedule,
  }, new Date("2025-03-08T15:00:00.000Z"));

  assert.equal(next, "2025-03-09T13:00:00.000Z");
});

test("one-time occurrences end after their scheduled instant", () => {
  assert.equal(computeNextRun({
    schedule_type: ONE_TIME,
    scheduled_for: "2025-01-01T00:00:00.000Z",
    schedule_rule: null,
    timezone: "UTC",
  }, now), null);
});

test("the scheduler arms a cron occurrence at the exact local time in its timezone", () => {
  const timezone = "America/New_York";
  const fireAt = DateTime.now().setZone(timezone).plus({ minutes: 3 }).startOf("minute");
  const expression = `${fireAt.minute} ${fireAt.hour} * * *`;
  const key = occurrenceKey("schedule-timezone-test", fireAt.toISO());

  try {
    assert.equal(
      armCronAt(key, expression, fireAt.toJSDate(), () => {}, timezone),
      "cron",
    );
  } finally {
    stopAll();
  }
});
