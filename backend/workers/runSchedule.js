// backend/workers/runSchedule.js
// Runs one occurrence of a schedule: opens an attempt, sends, retries on failure,
// closes the attempt, and moves the schedule forward.

import { computeNextRun } from "../services/scheduleRule.js";
import { sendScheduledEmail } from "../services/sendService.js";
import { decryptJson } from "../utils/credentialCrypto.js";
import { release, occurrenceKey } from "./scheduleQueue.js";
import {
  getScheduleStatus,
  getScheduleReadiness,
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

const sameInstant = (a, b) => new Date(a).getTime() === new Date(b).getTime();

const summarize = (failures) =>
  failures.map((item) => `${item.to}: ${item.reason}`).join("; ").slice(0, 500);

// Called by the queue when an occurrence fires.
export function runOccurrence(schedule, runFor) {
  return attempt({ scheduleId: schedule.id, projectId: schedule.project_id, runFor, number: 1 });
}

export function runImmediateOccurrence(schedule) {
  return attempt({
    scheduleId: schedule.id,
    projectId: schedule.project_id,
    runFor: schedule.next_run_at,
    number: 1,
    retryFailures: false,
  });
}

async function attempt({ scheduleId, projectId, runFor, number, retryFailures = true }) {
  const key = occurrenceKey(scheduleId, runFor);
  let runId;

  try {
    runId = await openAttempt({ scheduleId, runFor, attempt: number });
    if (!runId) {
      const current = await getScheduleStatus(scheduleId, projectId);
      if (!current) {
        console.warn(`[RUN] schedule ${scheduleId} no longer exists.`);
        return release(key);
      }
      return await resolveExisting({ current, runFor, key, retryFailures });
    }
  } catch (err) {
    console.error(`[RUN] schedule ${scheduleId} failed before sending; could not record the run:`, err?.message || err);
    release(key);
    return { status: "failed", error: String(err?.message || "Could not record schedule run.") };
  }

  const timerLabel = `schedule:${scheduleId}:attempt:${number}:run:${runId}`;
  console.time(timerLabel);
  try {
    const readiness = await getScheduleReadiness(scheduleId, projectId);
    if (!readiness.eligible) {
      const message = readiness.reason || "Schedule is not eligible to send.";
      console.warn(`[RUN] not sending schedule ${scheduleId}: ${message}`);
      await closeAttempt(runId, { status: "failed", error: message });
      console.error(`[RUN] schedule ${scheduleId} failed eligibility checks: ${message}`);

      if (readiness.schedule?.status === "active" && readiness.code !== "schedule_inactive") {
        await updateScheduleAfterOccurrence(scheduleId, projectId, {
          status: "failed",
          next_run_at: null,
          last_run_at: new Date().toISOString(),
          last_failure_reason: message.slice(0, 500),
        });
      }
      release(key);
      return { status: "failed", error: message };
    }

    const { schedule: current, connection } = readiness;
    if (!sameInstant(current.next_run_at, runFor)) {
      const message = "Schedule was edited before it ran.";
      await closeAttempt(runId, { status: "failed", error: message });
      console.warn(`[RUN] not sending schedule ${scheduleId}: ${message}`);
      console.error(`[RUN] schedule ${scheduleId} failed: ${message}`);
      release(key);
      return { status: "failed", error: message };
    }

    return await send({ current, connection, runFor, key, runId, number, retryFailures });
  } catch (err) {
    const message = String(err?.message || "Schedule run failed.");
    console.error(`[RUN] schedule ${scheduleId} attempt ${number} crashed:`, message);
    await closeAttempt(runId, { status: "failed", error: message }).catch((closeError) =>
      console.error(`[RUN] could not close failed attempt for schedule ${scheduleId}:`, closeError.message),
    );
    release(key);
    return { status: "failed", error: message };
  } finally {
    console.timeEnd(timerLabel);
  }
}

async function send({ current, connection, runFor, key, runId, number, retryFailures }) {
  let emailSent = false;

  try {
    const credentials = decryptJson(connection.credentials);
    const result = await sendScheduledEmail({ connection, credentials, config: current.config });
    emailSent = true;

    const partial = result.failures.length ? summarize(result.failures) : null;
    await closeAttempt(runId, { status: "succeeded", error: partial });
    await finishOccurrence(current, "sent", partial, number);
    console.info(`[RUN] schedule ${current.id} succeeded.`);
    release(key);
    return { status: "succeeded", error: partial };
  } catch (err) {
    const message = String(err?.message || "Send failed.");

    // Email already left the building. Record it and never send again.
    if (emailSent) {
      console.error("[RUN] email went out but the record failed", current.id, message);
      await closeAttempt(runId, { status: "succeeded", error: null }).catch((closeError) =>
        console.error(`[RUN] could not persist success for schedule ${current.id}:`, closeError.message),
      );
      await finishOccurrence(current, "sent", null, number).catch((e) =>
        console.error("[RUN] finish failed", current.id, e?.message || e),
      );
      console.info(`[RUN] schedule ${current.id} succeeded; persistence required recovery.`);
      release(key);
      return { status: "succeeded" };
    }

    await closeAttempt(runId, { status: "failed", error: message });

    if (err?.code === "GMAIL_REVOKED") {
      await markConnectionNeedsReconnect(current.email_connection_id, current.project_id);
    }

    if (retryFailures && !err?.permanent && number <= MAX_RETRIES) {
      const delay = RETRY_DELAYS_MS[number - 1];
      console.warn(
        `[RUN] ${current.id} attempt ${number} failed (${message}). Retry ${number + 1} in ${delay / RETRY_UNIT_MS} unit(s).`
      );
      // The key stays in the Map during retries so the planner cannot arm a duplicate.
      setTimeout(() => {
        attempt({
          scheduleId: current.id,
          projectId: current.project_id,
          runFor,
          number: number + 1,
          retryFailures,
        });
      }, delay);
      return;
    }

    await finishOccurrence(current, "failed", message, number);
    console.error(`[RUN] schedule ${current.id} failed: ${message}`);
    release(key);
    return { status: "failed", error: message };
  }
}

// Called on boot when a previous attempt row already exists for this occurrence.
// Happens when Render restarted between attempts or mid-send.
async function resolveExisting({ current, runFor, key, retryFailures = true }) {
  const latest = await getLatestAttempt(current.id, runFor);
  if (!latest) {
    release(key);
    return { status: "failed", error: "Could not read the previous schedule run." };
  }

  // Stopped between retries: pick up where it left off.
  if (retryFailures && latest.status === "failed" && latest.attempt <= MAX_RETRIES) {
    return attempt({
      scheduleId: current.id,
      projectId: current.project_id,
      runFor,
      number: latest.attempt + 1,
      retryFailures,
    });
  }

  // Stopped mid-send: never resend, the email may already have gone out.
  if (latest.status === "running") {
    await closeAttempt(latest.id, {
      status: "failed",
      error: "Interrupted by a restart. Not resent to avoid duplicates.",
    });
    await finishOccurrence(current, "failed", "Interrupted by a restart.", latest.attempt);
    console.error(`[RUN] schedule ${current.id} failed: interrupted by a restart; not resent.`);
    release(key);
    return { status: "failed", error: "Interrupted by a restart; not resent." };
  }

  if (latest.status === "succeeded") {
    await finishOccurrence(current, "sent", null, latest.attempt);
    console.info(`[RUN] schedule ${current.id} succeeded; recovered after restart.`);
    release(key);
    return { status: "succeeded" };
  }

  if (latest.status === "failed") {
    await finishOccurrence(current, "failed", "Retries exhausted.", latest.attempt);
    console.error(`[RUN] schedule ${current.id} failed: retries exhausted.`);
    release(key);
    return { status: "failed", error: "Retries exhausted." };
  }

  // No further work is due for this occurrence.
  release(key);
  return { status: "failed", error: `Previous run ended with status ${latest.status}.` };
}

// Move the schedule forward after its occurrence ends.
// One-time schedules get status 'completed' or 'failed' and no next_run_at.
// Recurring schedules get a future next_run_at and stay 'active'.
async function finishOccurrence(current, outcome, failureReason, attemptsUsed) {
  const now = new Date();
  const isRecurring = current.schedule_type === "recurring";
  const next = isRecurring ? computeNextRun(current, now) : null;

  await updateScheduleAfterOccurrence(current.id, current.project_id, {
    last_run_at: now.toISOString(),
    last_failure_reason: failureReason ? String(failureReason).slice(0, 500) : null,
    retry_count: Math.max(0, attemptsUsed - 1),
    run_count: outcome === "sent" ? (current.run_count || 0) + 1 : current.run_count || 0,
    next_run_at: next,
    status: next ? "active" : outcome === "sent" ? "completed" : "failed",
  });
}