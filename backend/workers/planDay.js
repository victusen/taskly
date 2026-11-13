// backend/workers/planDay.js
// Reads schedules whose next occurrence falls today in UTC and arms each one.
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
let planState = {
  startedAt: null,
  completedAt: null,
  candidates: 0,
  error: null,
};

// Returns the start and end of today in UTC (midnight to midnight).
export function utcDayWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// Fetch only active schedules whose next occurrence falls within this UTC day.
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
async function armSchedule(candidate, start, end) {
  const readiness = await getScheduleReadiness(candidate.id, candidate.project_id);
  if (!readiness.eligible) {
    console.warn(`[PLAN] not arming schedule ${candidate.id}: ${readiness.reason}`);
    return;
  }

  const schedule = readiness.schedule;
  const fireAt = new Date(schedule.next_run_at);
  if (!Number.isFinite(fireAt.getTime())) {
    console.warn(`[PLAN] skipped schedule ${candidate.id}: invalid next run time.`);
    return;
  }
  if (fireAt < start || fireAt >= end) {
    console.warn(
      `[PLAN] skipped schedule ${candidate.id}: next run ${schedule.next_run_at} is outside today's UTC window.`,
    );
    return;
  }

  const runFor = schedule.next_run_at;
  const key = occurrenceKey(schedule.id, runFor);
  const run = () => runOccurrence(schedule, runFor);
  if (fireAt.getTime() > Date.now()) {
    const expression = buildCronExpression(schedule);
    if (!expression) {
      throw new Error("Could not build the recurring schedule's UTC cron expression.");
    }
    const armedAs = armCronAt(key, expression, fireAt, run);
    if (armedAs !== "already_armed") {
      console.info(`[PLAN] schedule ${schedule.id} armed as ${armedAs} (${expression}) for ${runFor}.`);
    }
    return;
  }

  const armedAs = armAt(key, fireAt, run);
  if (armedAs !== "already_armed") {
    console.info(`[PLAN] schedule ${schedule.id} armed for ${runFor}.`);
  }
}

// Guard against concurrent planDay() calls (e.g. midnight cron + re-plan timer firing together).
let planInProgress = null;

// Plan today's schedules. Readiness is re-checked before arming in case a schedule
// changed after the initial query.
export async function planDay() {
  if (planInProgress) return planInProgress;

  planInProgress = (async () => {
    const plannedAt = new Date();
    planState = {
      ...planState,
      startedAt: plannedAt.toISOString(),
      candidates: 0,
      error: null,
    };
    try {
      const { start, end } = utcDayWindow();
      console.log("[PLAN] planning", start.toISOString(), "to", end.toISOString());

      const rows = await fetchWithRetry(start, end);
      planState.candidates = rows.length;
      await Promise.all(rows.map(async (row) => {
        try {
          await armSchedule(row, start, end);
        } catch (error) {
          console.error(`[PLAN] could not check schedule ${row.id}:`, error.message);
        }
      }));

      const armedTodayIds = summary().keys
        .map((key) => {
          const separator = key.lastIndexOf("|");
          const runAt = new Date(key.slice(separator + 1));
          return runAt >= start && runAt < end ? key.slice(0, separator) : null;
        })
        .filter(Boolean);
      const uniqueArmedIds = [...new Set(armedTodayIds)];
      console.info(
        `[PLAN] completed: ${uniqueArmedIds.length} schedule(s) armed for ${start.toISOString().slice(0, 10)} UTC.`,
      );
      if (uniqueArmedIds.length) {
        console.info(`[PLAN] schedule IDs: ${uniqueArmedIds.join(", ")}`);
      }
      planState.completedAt = new Date().toISOString();
    } catch (error) {
      planState.error = error.message || "Schedule planning failed.";
      throw error;
    } finally {
      planInProgress = null;
    }
  })();

  return planInProgress;
}

export function getPlannerStatus(now = new Date()) {
  const { start, end } = utcDayWindow(now);
  const armedTodayIds = summary().keys.map((key) => {
    const separator = key.lastIndexOf("|");
    const runAt = new Date(key.slice(key.lastIndexOf("|") + 1));
    return runAt >= start && runAt < end ? key.slice(0, separator) : null;
  }).filter(Boolean);
  const uniqueArmedIds = [...new Set(armedTodayIds)];

  return {
    last_plan_started_at: planState.startedAt,
    last_plan_completed_at: planState.completedAt,
    last_plan_candidates: planState.candidates,
    last_plan_error: planState.error,
    schedules_armed_today: uniqueArmedIds.length,
    schedule_ids_armed_today: uniqueArmedIds,
  };
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
    armSchedule(schedule, start, end).catch((error) =>
      console.error(`[PLAN] could not arm schedule ${schedule.id}:`, error.message),
    );
  }
}