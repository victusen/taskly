// backend/workers/planDay.js
// Reads schedules due by the end of today (including overdue runs) and arms each
// one in the in-memory queue.
// Called at boot and at midnight. Also called directly by syncSchedule when a
// schedule is created or edited mid-day.

import { createClient } from "@supabase/supabase-js";
import { armAt, armCronAt, disarmSchedule, occurrenceKey, summary } from "./scheduleQueue.js";
import { runOccurrence } from "./runSchedule.js";
import { getScheduleReadiness } from "../services/scheduleRunService.js";
import { buildCronExpression } from "../services/scheduleRule.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// How long to wait between Supabase fetch retries at boot.
const FETCH_RETRY_MS = 30_000;

// Returns the start and end of today in UTC (midnight to midnight).
export function utcDayWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// Fetch active schedules due before the end of the given time window.
// Retries once after FETCH_RETRY_MS on network failure (Render cold start).
async function fetchWithRetry(end) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { data, error } = await supabase
        .from("schedules")
        .select("*")
        .eq("status", "active")
        .lt("next_run_at", end.toISOString());
      if (error) throw error;
      return data;
    } catch (err) {
      if (attempt === 2) throw err;
      console.warn(`[PLAN] fetch failed, retrying in ${FETCH_RETRY_MS / 1000}s:`, err.message);
      await new Promise((resolve) => setTimeout(resolve, FETCH_RETRY_MS));
    }
  }
}

// Arm one schedule occurrence. Idempotent: calling it twice arms once.
async function armSchedule(candidate, end) {
  const readiness = await getScheduleReadiness(candidate.id, candidate.project_id);
  if (!readiness.eligible) {
    console.warn(`[PLAN] not arming schedule ${candidate.id}: ${readiness.reason}`);
    return;
  }

  const schedule = readiness.schedule;
  const fireAt = new Date(schedule.next_run_at);
  if (!Number.isFinite(fireAt.getTime()) || fireAt >= end) return;

  const runFor = schedule.next_run_at;
  const key = occurrenceKey(schedule.id, runFor);
  const run = () => runOccurrence(schedule, runFor);
  if (fireAt.getTime() > Date.now()) {
    const expression = buildCronExpression(schedule);
    if (!expression) {
      throw new Error("Could not build the recurring schedule's UTC cron expression.");
    }
    const armedAs = armCronAt(key, expression, fireAt, run);
    console.info(`[PLAN] schedule ${schedule.id} armed as ${armedAs} (${expression}) for ${runFor}.`);
    return;
  }

  armAt(key, fireAt, run);
  console.info(`[PLAN] schedule ${schedule.id} armed for ${runFor}.`);
}

// Guard against concurrent planDay() calls (e.g. midnight cron + re-plan timer firing together).
let planInProgress = null;

// Plan the whole day. Fetches today's schedules and arms all of them.
// Schedules already past due fire on the next tick (croner handles that).
export async function planDay() {
  if (planInProgress) return planInProgress;

  planInProgress = (async () => {
    try {
      const { start, end } = utcDayWindow();
      console.log("[PLAN] planning", start.toISOString(), "to", end.toISOString());

      const rows = await fetchWithRetry(end);
      await Promise.all(rows.map(async (row) => {
        try {
          await armSchedule(row, end);
        } catch (error) {
          console.error(`[PLAN] could not check schedule ${row.id}:`, error.message);
        }
      }));

      console.log("[PLAN] done.", summary());
    } finally {
      planInProgress = null;
    }
  })();

  return planInProgress;
}

// Called from scheduleService.js when a schedule is created, edited, paused or cancelled.
// Arms the new time, or cancels the old alarm if the schedule is no longer active.
export function syncSchedule(schedule) {
  if (schedule.status !== "active" || !schedule.next_run_at) {
    disarmSchedule(schedule.id);
    return;
  }

  disarmSchedule(schedule.id);
  const { start, end } = utcDayWindow();
  const runAt = new Date(schedule.next_run_at);

  // Only arm occurrences that fall inside today. Tomorrow's occurrences will be
  // armed by the midnight planner.
  if (runAt >= start && runAt < end) {
    armSchedule(schedule, end).catch((error) =>
      console.error(`[PLAN] could not arm schedule ${schedule.id}:`, error.message),
    );
  }
}