import assert from "node:assert/strict";
import { test } from "node:test";

import {
  aggregateScheduleTotals,
  getDashboardPeriod,
} from "../services/dashboardMetricsAggregation.js";

test("dashboard periods map to supported rolling windows", () => {
  assert.equal(getDashboardPeriod("3h").duration, 3 * 60 * 60 * 1000);
  assert.equal(getDashboardPeriod("1d").duration, 24 * 60 * 60 * 1000);
  assert.equal(getDashboardPeriod("7d").duration, 7 * 24 * 60 * 60 * 1000);
  assert.equal(getDashboardPeriod("30d").duration, 30 * 24 * 60 * 60 * 1000);
  assert.throws(() => getDashboardPeriod("90d"), { code: "INVALID_PERIOD" });
});

test("schedule totals aggregate statuses, lifetime runs, and schedules run in period", () => {
  const totals = aggregateScheduleTotals([
    { status: "active", run_count: 3, last_run_at: "2025-01-01T00:00:00.000Z" },
    { status: "active", run_count: "2", last_run_at: "2024-12-31T23:59:59.999Z" },
    { status: "paused", run_count: 0, last_run_at: "invalid" },
    { status: "cancelled", run_count: -1, last_run_at: "2025-01-02T00:00:00.000Z" },
    { status: "unknown", run_count: "invalid", last_run_at: null },
  ], "2025-01-01T00:00:00.000Z", "2025-01-01T23:59:59.999Z");

  assert.deepEqual(totals, {
    total: 5,
    by_status: {
      active: 2,
      paused: 1,
      failed: 0,
      completed: 0,
      cancelled: 1,
    },
    lifetime_runs: 5,
    period_schedules: 1,
  });
});
