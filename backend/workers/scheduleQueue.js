// backend/workers/scheduleQueue.js
// In-memory registry of armed occurrences.
// Keys are "scheduleId|ISO-runFor". Values are croner Cron instances.
// Resets on restart — the planner rebuilds it from the database at boot.

import { Cron } from "croner";

const armed = new Map();

// Build the Map key from a schedule id and the ISO timestamp it runs at.
export function occurrenceKey(scheduleId, runFor) {
  return `${scheduleId}|${new Date(runFor).toISOString()}`;
}

// Arm one occurrence. fn() will be called once at fireAt.
// If the time is already past, croner fires on the next tick.
// If the key already exists, this is a no-op — the original alarm stays.
export function armAt(key, fireAt, fn) {
  if (armed.has(key)) return;
  const job = new Cron(new Date(fireAt), { maxRuns: 1 }, fn);
  armed.set(key, job);
}

// Remove an occurrence from the registry after it has run (or been skipped/cancelled).
export function release(key) {
  const job = armed.get(key);
  if (job) { try { job.stop(); } catch (_) {} }
  armed.delete(key);
}

// Cancel all armed occurrences for a schedule (e.g. on pause or cancel).
// Prefix match: every key that starts with "scheduleId|".
export function disarmSchedule(scheduleId) {
  const prefix = `${scheduleId}|`;
  for (const [key, job] of armed) {
    if (key.startsWith(prefix)) {
      try { job.stop(); } catch (_) {}
      armed.delete(key);
    }
  }
}

// Stop every armed occurrence. Called at shutdown or between tests.
export function stopAll() {
  for (const job of armed.values()) {
    try { job.stop(); } catch (_) {}
  }
  armed.clear();
}

// Diagnostic snapshot for logs and tests.
export function summary() {
  return { armed: armed.size, keys: [...armed.keys()] };
}