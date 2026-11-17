// backend/workers/startScheduler.js
// Starts the scheduler engine: boot plan, midnight re-plan, and expiry cleanup.

import { Cron } from "croner";
import { planDay } from "./planDay.js";
import { stopAll } from "./scheduleQueue.js";
import { expireBillingPlans } from "./expireBillingPlans.js";
import { resetPlanUsage } from "./resetPlanUsage.js";

const plannerJobs = [];

async function checkExpiredPlans(trigger) {
  try {
    await expireBillingPlans(new Date(), trigger);
  } catch (error) {
    console.error(`[BILLING] ${trigger} expiry check failed:`, error.message);
  }
}

async function checkPlanUsagePeriods(trigger) {
  try {
    await resetPlanUsage(trigger);
  } catch (error) {
    console.error(`[PLAN USAGE] ${trigger} rollover check failed:`, error.message);
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
    await checkPlanUsagePeriods("midnight");
  }));

  console.log("[SCHEDULER] running");
  await checkExpiredPlans("startup");
  await checkPlanUsagePeriods("startup");
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