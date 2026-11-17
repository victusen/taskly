import { Router } from "express";
import { supabase } from "../config/supabase.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { planUsageMiddleware } from "../middleware/planUsageMiddleware.js";
import { effectivePlanTier } from "../services/planService.js";

const router = Router();

/* The one place the frontend learns the effective plan. Expiry is checked here, not trusted from a stored word. */
router.get("/", authMiddleware, planUsageMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from("users")
    .select("email, plan_tier, billing_cycle_ends_at")
    .eq("id", req.user.id)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ success: false, code: "SERVER_ERROR", message: "Could not load your account." });
  }

  const plan = effectivePlanTier(data);
  const isTimeLimitedPlan = plan === "paid" || plan === "business";
  const cycleEnd = data?.billing_cycle_ends_at
    ? new Date(data.billing_cycle_ends_at)
    : null;
  const cycleIsCurrent = cycleEnd !== null && Number.isFinite(cycleEnd.getTime()) && cycleEnd > new Date();

  return res.status(200).json({
    success: true,
    data: {
      email: data?.email ?? null,
      plan,
      plan_tier: plan,
      billing_cycle_ends_at:
        isTimeLimitedPlan && cycleIsCurrent
          ? data.billing_cycle_ends_at
          : null,
    },
  });
});

export default router;