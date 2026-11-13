// backend/workers/startScheduler.js
// Starts the scheduler engine: boot plan, midnight re-plan, expiry cleanup, and
// a 5-minute catch-up for schedules created during the day.

import { Cron } from "croner";
import { planDay } from "./planDay.js";
import { stopAll } from "./scheduleQueue.js";
import { expireBillingPlans } from "./expireBillingPlans.js";

const plannerJobs = [];

async function checkExpiredPlans(trigger) {
  try {
    await expireBillingPlans(new Date(), trigger);
  } catch (error) {
    console.error(`[BILLING] ${trigger} expiry check failed:`, error.message);
  }
}

export async function startScheduler() {
  console.log("[SCHEDULER] starting");

  try {
    await planDay();
  } catch (error) {
    console.error("[SCHEDULER] boot plan failed:", error.message);
  }

  // Midnight UTC: re-plan the new day and reset expired subscriptions.
  plannerJobs.push(new Cron("0 0 * * *", { timezone: "UTC" }, async () => {
    console.log("[SCHEDULER] midnight re-plan");
    try {
      await planDay();
    } catch (error) {
      console.error("[SCHEDULER] midnight plan failed:", error.message);
    }
    await checkExpiredPlans("midnight");
  }));

  // 5-minute catch-up: arms schedules created or edited during the day that were
  // missed if the midnight cron already ran (e.g. a schedule created at 14:30 for 15:00).
  plannerJobs.push(new Cron("*/5 * * * *", { timezone: "UTC" }, () => {
    planDay().catch((err) => console.error("[SCHEDULER] re-plan failed:", err.message));
  }));

  console.log("[SCHEDULER] running");
  await checkExpiredPlans("startup");
}

export function stopScheduler() {
  for (const job of plannerJobs.splice(0)) {
    job.stop();
  }
  stopAll();
}

// Graceful shutdown: stop all timers so the process exits cleanly.
process.on("SIGTERM", () => {
  console.log("[SCHEDULER] shutting down");
  stopScheduler();
});