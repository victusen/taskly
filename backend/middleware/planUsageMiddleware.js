import { consumePlanUsage, PlanUsageError } from "../services/planUsageService.js";

export async function planUsageMiddleware(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({
      success: false,
      code: "UNAUTHENTICATED",
      message: "Sign in to make this request.",
    });
  }

  try {
    const usage = await consumePlanUsage(req.user.id, "api_requests", 1);
    if (!usage.allowed) {
      return res.status(429).json({
        success: false,
        code: "PLAN_LIMIT_REACHED",
        message: `Your plan allows ${usage.limit} API requests in each 31-day period. Your limit resets on ${new Date(usage.window.endAt).toLocaleDateString()}.`,
        data: {
          used: usage.used,
          limit: usage.limit,
          remaining: usage.remaining,
          resets_at: usage.window.endAt,
        },
      });
    }
    res.setHeader("X-Plan-Api-Limit", String(usage.limit ?? ""));
    if (Number.isFinite(usage.remaining)) {
      res.setHeader("X-Plan-Api-Remaining", String(usage.remaining));
    }
    return next();
  } catch (error) {
    console.error("[PLAN API USAGE]", error);
    const status = error instanceof PlanUsageError ? error.status : 503;
    return res.status(status).json({
      success: false,
      code: "PLAN_USAGE_UNAVAILABLE",
      message: "Usage limits could not be verified, so this request was not processed.",
    });
  }
}
