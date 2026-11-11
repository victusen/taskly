import { supabase } from "../config/supabase.js";

export async function expireBillingPlans(now = new Date(), trigger = "scheduled") {
  const timerLabel = `billing-plan-expiry:${trigger}:${now.toISOString()}`;
  console.time(timerLabel);

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
      console.info(
        `[BILLING] expired plan reset for user ${user.id}; plan is now free.`,
      );
    }

    console.info(
      `[BILLING] expiry check completed; reset ${(data || []).length} account(s).`,
    );
    return (data || []).length;
  } finally {
    console.timeEnd(timerLabel);
  }
}
