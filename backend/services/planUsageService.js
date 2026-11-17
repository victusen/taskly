import { supabase } from "../config/supabase.js";
import { getEffectivePlan, effectivePlanTier } from "./planService.js";
import { getPlanLimits } from "../config/planLimits.js";

const USAGE_PERIOD_DAYS = 31;
const USAGE_PERIOD_MS = USAGE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
const USER_PAGE_SIZE = 500;
const USAGE_SYNC_CONCURRENCY = 10;

const METRICS = Object.freeze({
  api_requests: "apiRequestsPerMonth",
  recipients: "recipientsPerMonth",
});

export class PlanUsageError extends Error {
  constructor(message, status = 503, code = "PLAN_USAGE_UNAVAILABLE") {
    super(message);
    this.name = "PlanUsageError";
    this.status = status;
    this.code = code;
    this.permanent = true;
  }
}

export function getUsageWindow(anchorAt, now = new Date()) {
  const anchor = new Date(anchorAt).getTime();
  const current = new Date(now).getTime();
  if (!Number.isFinite(anchor) || !Number.isFinite(current)) {
    throw new TypeError("A valid usage-window anchor and current date are required.");
  }

  const periodIndex = Math.max(0, Math.floor((current - anchor) / USAGE_PERIOD_MS));
  const start = new Date(anchor + periodIndex * USAGE_PERIOD_MS);
  const end = new Date(start.getTime() + USAGE_PERIOD_MS);
  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  };
}

async function getLastSuccessfulPaymentAt(userId) {
  const { data, error } = await supabase
    .from("payments")
    .select("resolved_at")
    .eq("user_id", userId)
    .eq("status", "succeeded")
    .not("resolved_at", "is", null)
    .order("resolved_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.resolved_at || null;
}

async function buildUsageContext(userId, profile, now) {
  const tier = effectivePlanTier(profile, now);
  const createdAt = profile?.created_at;
  if (!createdAt || !Number.isFinite(new Date(createdAt).getTime())) {
    throw new PlanUsageError("The account usage period could not be determined.");
  }

  let anchorAt = createdAt;
  if (tier === "paid" || tier === "business") {
    anchorAt = (await getLastSuccessfulPaymentAt(userId)) || createdAt;
  } else if (profile?.billing_cycle_ends_at) {
    const lastBillingEnd = new Date(profile.billing_cycle_ends_at);
    if (Number.isFinite(lastBillingEnd.getTime()) && lastBillingEnd <= now) {
      anchorAt = lastBillingEnd;
    }
  }

  return {
    userId,
    tier,
    limits: getPlanLimits(tier),
    profile,
    window: getUsageWindow(anchorAt, now),
  };
}

export async function getPlanUsageContext(userId, now = new Date()) {
  const plan = await getEffectivePlan(userId, now);
  if (!plan.profile) {
    throw new PlanUsageError("The account usage period could not be determined.");
  }
  return buildUsageContext(userId, plan.profile, now);
}

function rpcRow(data, operation) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.allowed !== "boolean") {
    throw new PlanUsageError(`Supabase returned an invalid result for ${operation}.`);
  }
  return row;
}

function usageRpcError(error, operation) {
  const wrapped = new PlanUsageError(
    `Could not ${operation}. Apply the plan-usage SQL functions in Supabase first.`,
  );
  wrapped.cause = error;
  return wrapped;
}

export async function consumePlanUsage(userId, metric, amount, now = new Date()) {
  const limitProperty = METRICS[metric];
  if (!limitProperty || !Number.isInteger(amount) || amount < 1) {
    throw new TypeError("A supported usage metric and positive integer amount are required.");
  }

  const context = await getPlanUsageContext(userId, now);
  const limit = context.limits[limitProperty];
  if (limit === null || limit === undefined) {
    return {
      allowed: true,
      unlimited: true,
      metric,
      amount,
      limit: null,
      window: context.window,
    };
  }

  const { data, error } = await supabase.rpc("consume_plan_usage", {
    p_user_id: userId,
    p_period_start_at: context.window.startAt,
    p_period_end_at: context.window.endAt,
    p_metric: metric,
    p_amount: amount,
    p_limit: limit,
  });
  if (error) throw usageRpcError(error, "consume plan usage");

  const row = rpcRow(data, "consume_plan_usage");
  return {
    allowed: row.allowed,
    metric,
    amount,
    limit,
    used: Number(row.used),
    remaining: Number(row.remaining),
    window: context.window,
  };
}

export async function releasePlanUsage(userId, metric, amount, periodStartAt) {
  if (!METRICS[metric] || !Number.isInteger(amount) || amount < 1) return;
  const { error } = await supabase.rpc("release_plan_usage", {
    p_user_id: userId,
    p_period_start_at: periodStartAt,
    p_metric: metric,
    p_amount: amount,
  });
  if (error) throw usageRpcError(error, "release reserved plan usage");
}

async function syncPlanUsagePeriod(userId, context) {
  const { data, error } = await supabase.rpc("sync_plan_usage_period", {
    p_user_id: userId,
    p_period_start_at: context.window.startAt,
    p_period_end_at: context.window.endAt,
  });
  if (error) throw usageRpcError(error, "synchronize a plan usage period");
  return data;
}

export async function resetPlanUsagePeriods(now = new Date()) {
  let processed = 0;
  let offset = 0;

  while (true) {
    const { data: profiles, error } = await supabase
      .from("users")
      .select("id, created_at, plan_tier, billing_cycle_ends_at")
      .order("id", { ascending: true })
      .range(offset, offset + USER_PAGE_SIZE - 1);
    if (error) throw error;
    if (!profiles?.length) break;

    for (let index = 0; index < profiles.length; index += USAGE_SYNC_CONCURRENCY) {
      const batch = profiles.slice(index, index + USAGE_SYNC_CONCURRENCY);
      await Promise.all(batch.map(async (profile) => {
        const context = await buildUsageContext(profile.id, profile, now);
        await syncPlanUsagePeriod(profile.id, context);
      }));
    }

    processed += profiles.length;
    if (profiles.length < USER_PAGE_SIZE) break;
    offset += USER_PAGE_SIZE;
  }

  return processed;
}
