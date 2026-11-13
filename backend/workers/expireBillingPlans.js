import { supabase } from "../config/supabase.js";

let expiryStatus = {
  last_checked_at: null,
  last_trigger: null,
  accounts_reset: 0,
  last_error: null,
};

export async function expireBillingPlans(now = new Date(), trigger = "scheduled") {
  const timerLabel = `billing-plan-expiry:${trigger}:${now.toISOString()}`;
  console.info(`[BILLING] ${trigger} expiry check starting.`);
  console.time(timerLabel);
  expiryStatus = {
    ...expiryStatus,
    last_checked_at: now.toISOString(),
    last_trigger: trigger,
    accounts_reset: 0,
    last_error: null,
  };

  let resetCount = 0;
  try {
    const expiredAt = now.toISOString();
    const { data, error } = await supabase
      .from("users")
      .update({
        plan_tier: "free",
        billing_cycle_ends_at: null,
      })
      .in("plan_tier", ["paid", "business"])
      .not("billing_cycle_ends_at", "is", null)
      .lte("billing_cycle_ends_at", expiredAt)
      .select("id, plan_tier");

    if (error) throw error;

    for (const user of data || []) {
      console.info(`[BILLING] User ${user.id} billing expired; plan reset to free.`);
    }

    resetCount = (data || []).length;
    expiryStatus.accounts_reset = resetCount;
    expiryStatus.last_checked_at = new Date().toISOString();
  } catch (error) {
    expiryStatus.last_error = error.message || "Billing expiry check failed.";
    throw error;
  } finally {
    console.timeEnd(timerLabel);
  }

  console.info(`[BILLING] expiry check completed; reset ${resetCount} account(s).`);
  return resetCount;
}

export function getBillingExpiryStatus() {
  return { ...expiryStatus };
}
