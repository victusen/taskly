const freezeLimits = (limits) => Object.freeze(limits);

export const PLAN_LIMITS = Object.freeze({
  free: freezeLimits({
    projects: 1,
    activeSchedulesPerProject: 5,
    recipientsPerMonth: 2_000,
    teamMembers: 1,
    smtp: true,
    apiRequestsPerMonth: 200,
    support: "message-anytime",
  }),
  paid: freezeLimits({
    projects: 1,
    activeSchedulesPerProject: 15,
    recipientsPerMonth: 5_000,
    teamMembers: 1,
    smtp: true,
    apiRequestsPerMonth: 1_000,
    support: "email-anytime",
  }),
  business: freezeLimits({
    projects: 5,
    activeSchedulesPerProject: 25,
    recipientsPerMonth: 50_000,
    teamMembers: null,
    smtp: true,
    apiRequestsPerMonth: 10_000,
    support: "urgent",
  }),
  custom: freezeLimits({
    projects: null,
    activeSchedulesPerProject: null,
    recipientsPerMonth: null,
    teamMembers: null,
    smtp: true,
    apiRequestsPerMonth: null,
    support: "contract",
  }),
});

export function normalizePlanTier(value) {
  const tier = String(value || "free").toLowerCase();
  return Object.hasOwn(PLAN_LIMITS, tier) ? tier : "free";
}

export function getPlanLimits(value) {
  return PLAN_LIMITS[normalizePlanTier(value)];
}
