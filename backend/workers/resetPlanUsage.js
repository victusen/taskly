import { resetPlanUsagePeriods } from "../services/planUsageService.js";

export async function resetPlanUsage(trigger = "scheduled", now = new Date()) {
  console.info(`[PLAN USAGE] ${trigger} rollover check starting.`);
  const processed = await resetPlanUsagePeriods(now);
  console.info(`[PLAN USAGE] ${trigger} rollover check updated ${processed} account(s).`);
  return processed;
}
