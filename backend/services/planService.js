import { supabase } from "../config/supabase.js";
import { getPlanLimits, normalizePlanTier } from "../config/planLimits.js";

export function effectivePlanTier(profile, now = new Date()) {
  const tier = normalizePlanTier(profile?.plan_tier);
  if (tier !== "paid" && tier !== "business") return tier;

  const cycleEnd = profile?.billing_cycle_ends_at
    ? new Date(profile.billing_cycle_ends_at)
    : null;
  return cycleEnd && Number.isFinite(cycleEnd.getTime()) && cycleEnd > now
    ? tier
    : "free";
}

export async function getPlanProfile(userId) {
  const { data, error } = await supabase
    .from("users")
    .select("id, created_at, plan_tier, billing_cycle_ends_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getEffectivePlan(userId, now = new Date()) {
  const profile = await getPlanProfile(userId);
  const tier = effectivePlanTier(profile, now);
  return { profile, tier, limits: getPlanLimits(tier) };
}
