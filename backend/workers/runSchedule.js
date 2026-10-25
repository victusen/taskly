// backend/workers/runSchedule.js
// Runs one occurrence of a schedule: opens an attempt, sends, retries on failure,
// closes the attempt, and moves the schedule forward.

import { computeNextRun } from "../services/scheduleRule.js";
import { sendScheduledEmail } from "../services/sendService.js";
import { decryptJson } from "../utils/credentialCrypto.js";
import { release, occurrenceKey } from "./scheduleQueue.js";
import {
  getScheduleStatus,
  getActiveConnection,
  openAttempt,
  closeAttempt,
  getLatestAttempt,
  updateScheduleAfterOccurrence,
  markConnectionNeedsReconnect,
} from "../services/scheduleRunService.js";

// Three retries after the first attempt: four attempts in total.
export const MAX_RETRIES = 3;

// Gaps between attempts are 2, 10 and 30 units.
// A unit is one minute in production. Tests override with SCHEDULER_RETRY_UNIT_MS.
const RETRY_UNIT_MS = Number(process.env.SCHEDULER_RETRY_UNIT_MS) || 60_000;
const RETRY_DELAYS_MS = [2, 10, 30].map((units) => units * RETRY_UNIT_MS);

// Errors marked permanent skip retries entirely (wrong password, revoked account, etc.).
function permanent(message) {
  const error = new Error(message);
  error.permanent = true;
  return error;
}

const sameInstant = (a, b) => new Date(a).getTime() === new Date(b).getTime();

const summarize = (failures) =>
  failures.map((item) => `${item.to}: ${item.reason}`).join("; ").slice(0, 500);

// Called by the queue when an occurrence fires.
export function runOccurrence(schedule, runFor) {
  return attempt({ scheduleId: schedule.id, userId: schedule.user_id, runFor, number: 1 });
}

async function attempt({ scheduleId, userId, runFor, number }) {
  const key = occurrenceKey(scheduleId, runFor);

  try {
    const current = await getScheduleStatus(scheduleId, userId);
    if (!current) return release(key);

    const runId = await openAttempt({ scheduleId, userId, runFor, attempt: number });
    if (!runId) return await resolveExisting({ current, runFor, key });

    const stillDue = sameInstant(current.next_run_at, runFor);
    if (current.status !== "active" || !stillDue) {
      await closeAttempt(runId, {
        status: "skipped",
        error: "Paused, cancelled or edited before it ran.",
      });
      return release(key);
    }

    return await send({ current, runFor, key, runId, number });
  } catch (err) {
    console.error("[RUN] attempt crashed", scheduleId, number, err?.message || err);
    release(key);
  }
}

async function send({ current, runFor, key, runId, number }) {
  let emailSent = false;

  try {
    const connection = await getActiveConnection(current.email_connection_id, current.user_id);
    if (!connection || connection.status !== "active") {
      throw permanent("The mail account is missing or needs to be reconnected.");
    }

    const credentials = decryptJson(connection.credentials);
    const result = await sendScheduledEmail({ connection, credentials, config: current.config });
    emailSent = true;

    const partial = result.failures.length ? summarize(result.failures) : null;
    await closeAttempt(runId, { status: "sent", error: partial });
    await finishOccurrence(current, "sent", partial, number);
    return release(key);
  } catch (err) {
    const message = String(err?.message || "Send failed.");

    // Email already left the building. Record it and never send again.
    if (emailSent) {
      console.error("[RUN] email went out but the record failed", current.id, message);
      await finishOccurrence(current, "sent", null, number).catch((e) =>
        console.error("[RUN] finish failed", current.id, e?.message || e),
      );
      return release(key);
    }

    await closeAttempt(runId, { status: "failed", error: message });

    if (err?.code === "GMAIL_REVOKED") {
      await markConnectionNeedsReconnect(current.email_connection_id, current.user_id);
    }

    if (!err?.permanent && number <= MAX_RETRIES) {
      const delay = RETRY_DELAYS_MS[number - 1];
      console.warn(
        `[RUN] ${current.id} attempt ${number} failed (${message}). Retry ${number + 1} in ${delay / RETRY_UNIT_MS} unit(s).`
      );
      // The key stays in the Map during retries so the planner cannot arm a duplicate.
      setTimeout(() => {
        attempt({ scheduleId: current.id, userId: current.user_id, runFor, number: number + 1 });
      }, delay);
      return;
    }

    await finishOccurrence(current, "failed", message, number);
    return release(key);
  }
}

// Called on boot when a previous attempt row already exists for this occurrence.
// Happens when Render restarted between attempts or mid-send.
async function resolveExisting({ current, runFor, key }) {
  const latest = await getLatestAttempt(current.id, runFor);
  if (!latest) return release(key);

  // Stopped between retries: pick up where it left off.
  if (latest.status === "failed" && latest.attempt <= MAX_RETRIES) {
    return attempt({
      scheduleId: current.id,
      userId: current.user_id,
      runFor,
      number: latest.attempt + 1,
    });
  }

  // Stopped mid-send: never resend, the email may already have gone out.
  if (latest.status === "running") {
    await closeAttempt(latest.id, {
      status: "failed",
      error: "Interrupted by a restart. Not resent to avoid duplicates.",
    });
    await finishOccurrence(current, "failed", "Interrupted by a restart.", latest.attempt);
    return release(key);
  }

  if (latest.status === "sent") {
    await finishOccurrence(current, "sent", null, latest.attempt);
    return release(key);
  }

  if (latest.status === "failed") {
    await finishOccurrence(current, "failed", "Retries exhausted.", latest.attempt);
    return release(key);
  }

  // skipped: nothing to do
  return release(key);
}

// Move the schedule forward after its occurrence ends.
// One-time schedules get status 'completed' or 'failed' and no next_run_at.
// Recurring schedules get a future next_run_at and stay 'active'.
async function finishOccurrence(current, outcome, failureReason, attemptsUsed) {
  const now = new Date();
  const isRecurring = current.schedule_type === "recurring";
  const next = isRecurring ? computeNextRun(current, now) : null;

  await updateScheduleAfterOccurrence(current.id, current.user_id, {
    last_run_at: now.toISOString(),
    last_failure_reason: failureReason ? String(failureReason).slice(0, 500) : null,
    retry_count: Math.max(0, attemptsUsed - 1),
    run_count: outcome === "sent" ? (current.run_count || 0) + 1 : current.run_count || 0,
    next_run_at: next,
    status: next ? "active" : outcome === "sent" ? "completed" : "failed",
  });
}