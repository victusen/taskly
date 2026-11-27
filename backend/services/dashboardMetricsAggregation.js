const PERIODS = Object.freeze({
  "3h": 3 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
});
const SCHEDULE_STATUSES = ["active", "paused", "failed", "completed", "cancelled"];

export class DashboardMetricsError extends Error {
  constructor(message) {
    super(message);
    this.name = "DashboardMetricsError";
    this.status = 400;
    this.code = "INVALID_PERIOD";
  }
}

export function getDashboardPeriod(period) {
  const duration = PERIODS[period];
  if (!duration) {
    throw new DashboardMetricsError("Choose a supported dashboard period.");
  }
  return { period, duration };
}

export function aggregateScheduleTotals(schedules, startAt, endAt) {
  const byStatus = Object.fromEntries(SCHEDULE_STATUSES.map((status) => [status, 0]));
  let lifetimeRuns = 0;
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  let periodSchedules = 0;

  for (const schedule of schedules) {
    if (Object.hasOwn(byStatus, schedule.status)) byStatus[schedule.status] += 1;
    const runCount = Number(schedule.run_count);
    if (Number.isSafeInteger(runCount) && runCount > 0) lifetimeRuns += runCount;
    const lastRun = Date.parse(schedule.last_run_at);
    if (Number.isFinite(lastRun) && lastRun >= start && lastRun <= end) periodSchedules += 1;
  }

  return {
    total: schedules.length,
    by_status: byStatus,
    lifetime_runs: lifetimeRuns,
    period_schedules: periodSchedules,
  };
}
