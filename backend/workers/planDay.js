// backend/workers/planDay.js
// Reads all schedules due today from Supabase and arms each one in the in-memory queue.
// Called at boot and at midnight. Also called directly by syncSchedule when a
// schedule is created or edited mid-day.

import { createClient } from "@supabase/supabase-js";
import { armAt, disarmSchedule, occurrenceKey, summary } from "./scheduleQueue.js";
import { runOccurrence } from "./runSchedule.js";

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

// Fetch all active schedules due in the given time window.
// Retries once after FETCH_RETRY_MS on network failure (Render cold start).
async function fetchWithRetry(start, end) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { data, error } = await supabase
        .from("schedules")
        .select("*")
        .eq("status", "active")
        .gte("next_run_at", start.toISOString())
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
function armSchedule(schedule) {
  const runFor = schedule.next_run_at;
  const key = occurrenceKey(schedule.id, runFor);
  const fireAt = new Date(runFor);

  armAt(key, fireAt, () => runOccurrence(schedule, runFor));
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

      const rows = await fetchWithRetry(start, end);
      for (const row of rows) armSchedule(row);

      console.log("[PLAN] done.", summary());
    } finally {
      planInProgress = null;
    }
  })();

  return planInProgress;
}

// Called from scheduleService.js when a schedule is created, edited, paused or cancelled.
// Arms the new time, or cancels the old alarm if the schedule is no longer active.
export function syncSchedule(userId, schedule) {
  if (schedule.status !== "active" || !schedule.next_run_at) {
    disarmSchedule(schedule.id);
    return;
  }

  const { start, end } = utcDayWindow();
  const runAt = new Date(schedule.next_run_at);

  // Only arm occurrences that fall inside today. Tomorrow's occurrences will be
  // armed by the midnight planner.
  if (runAt >= start && runAt < end) {
    // Disarm first so an edited time replaces the old alarm.
    disarmSchedule(schedule.id);
    armSchedule(schedule);
  }
}