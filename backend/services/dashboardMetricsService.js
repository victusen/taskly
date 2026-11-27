import { supabase } from "../config/supabase.js";
import {
  aggregateScheduleTotals,
  getDashboardPeriod,
} from "./dashboardMetricsAggregation.js";

const PROJECT_PAGE_SIZE = 500;
const SCHEDULE_PAGE_SIZE = 500;
const PROJECT_BATCH_SIZE = 100;
const SCHEDULE_BATCH_SIZE = 100;
const RUN_STATUSES = ["succeeded", "failed", "running"];

async function loadProjects(userId) {
  const projects = [];
  for (let offset = 0; ; offset += PROJECT_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .range(offset, offset + PROJECT_PAGE_SIZE - 1);
    if (error) throw error;
    projects.push(...(data || []));
    if (!data || data.length < PROJECT_PAGE_SIZE) break;
  }
  return projects;
}

async function loadSchedules(projectIds) {
  const schedules = [];
  for (let start = 0; start < projectIds.length; start += PROJECT_BATCH_SIZE) {
    const projectBatch = projectIds.slice(start, start + PROJECT_BATCH_SIZE);
    for (let offset = 0; ; offset += SCHEDULE_PAGE_SIZE) {
      const { data, error } = await supabase
        .from("schedules")
        .select("id, status, run_count, last_run_at")
        .in("project_id", projectBatch)
        .order("id", { ascending: true })
        .range(offset, offset + SCHEDULE_PAGE_SIZE - 1);
      if (error) throw error;
      schedules.push(...(data || []));
      if (!data || data.length < SCHEDULE_PAGE_SIZE) break;
    }
  }
  return schedules;
}

async function countRuns(scheduleIds, status, startAt, endAt) {
  let total = 0;
  for (let start = 0; start < scheduleIds.length; start += SCHEDULE_BATCH_SIZE) {
    const scheduleBatch = scheduleIds.slice(start, start + SCHEDULE_BATCH_SIZE);
    const { count, error } = await supabase
      .from("schedule_runs")
      .select("id", { count: "exact", head: true })
      .in("schedule_id", scheduleBatch)
      .eq("status", status)
      .gte("started_at", startAt)
      .lte("started_at", endAt);
    if (error) throw error;
    total += count || 0;
  }
  return total;
}

export async function getDashboardScheduleMetrics(userId, period = "7d", now = new Date()) {
  const { duration } = getDashboardPeriod(period);
  const endAt = new Date(now).toISOString();
  const startAt = new Date(new Date(now).getTime() - duration).toISOString();
  const projects = await loadProjects(userId);
  const schedules = projects.length
    ? await loadSchedules(projects.map((project) => project.id))
    : [];
  const scheduleTotals = aggregateScheduleTotals(schedules, startAt, endAt);
  const runCounts = Object.fromEntries(
    await Promise.all(RUN_STATUSES.map(async (status) => [
      status,
      await countRuns(schedules.map((schedule) => schedule.id), status, startAt, endAt),
    ])),
  );

  return {
    period,
    period_started_at: startAt,
    period_ended_at: endAt,
    projects: projects.length,
    schedules: scheduleTotals,
    runs: {
      total: RUN_STATUSES.reduce((total, status) => total + runCounts[status], 0),
      ...runCounts,
    },
  };
}
