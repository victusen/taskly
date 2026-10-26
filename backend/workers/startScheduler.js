// backend/workers/startScheduler.js
// Starts the scheduler engine: boot plan, midnight re-plan, expiry cleanup, and
// a 5-minute catch-up for schedules created during the day.

import { Cron } from "croner";
import { planDay } from "./planDay.js";
import { stopAll } from "./scheduleQueue.js";

export function startScheduler() {
  console.log("[SCHEDULER] starting");

  // Boot: arm everything due today.
  planDay().catch((err) => console.error("[SCHEDULER] boot plan failed:", err.message));

  // Midnight UTC: re-plan the new day.
  new Cron("0 0 * * *", { timezone: "UTC" }, () => {
    console.log("[SCHEDULER] midnight re-plan");
    planDay().catch((err) => console.error("[SCHEDULER] midnight plan failed:", err.message));
  });

  // 5-minute catch-up: arms schedules created or edited during the day that were
  // missed if the midnight cron already ran (e.g. a schedule created at 14:30 for 15:00).
  new Cron("*/5 * * * *", { timezone: "UTC" }, () => {
    planDay().catch((err) => console.error("[SCHEDULER] re-plan failed:", err.message));
  });

  // 00:05 UTC: clean up plan_expires_at records from yesterday (if you add that column later).
  // new Cron("5 0 * * *", { timezone: "UTC" }, cleanupExpiredRuns);

  console.log("[SCHEDULER] running");
}

// Graceful shutdown: stop all timers so the process exits cleanly.
process.on("SIGTERM", () => {
  console.log("[SCHEDULER] shutting down");
  stopAll();
});