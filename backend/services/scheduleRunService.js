// backend/services/scheduleRunsService.js
// Talks to the real Supabase database. Uses service-role key so RLS does not block writes.
// Column names here must match the live schema exactly.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Read the current state of a schedule scoped to its owning project.
export async function getScheduleStatus(scheduleId, projectId) {
  const { data, error } = await supabase
    .from("schedules")
    .select("*")
    .eq("id", scheduleId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getScheduleReadiness(scheduleId, projectId) {
  const { data: schedule, error: scheduleError } = await supabase
    .from("schedules")
    .select("*")
    .eq("id", scheduleId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (scheduleError) throw scheduleError;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, user_id, status")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) throw projectError;

  let account = null;
  if (project?.user_id) {
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .eq("id", project.user_id)
      .maybeSingle();
    if (error) throw error;
    account = data;
  }

  let connection = null;
  if (schedule?.email_connection_id) {
    const { data, error } = await supabase
      .from("email_connections")
      .select("*")
      .eq("id", schedule.email_connection_id)
      .eq("project_id", projectId)
      .maybeSingle();
    if (error) throw error;
    connection = data;
  }

  const issues = [];
  if (!schedule) issues.push({ code: "schedule_missing", reason: "Schedule was deleted or is unavailable." });
  else if (schedule.status !== "active") {
    issues.push({ code: "schedule_inactive", reason: `Schedule status is ${schedule.status}.` });
  }
  else if (schedule.job_type !== "email") {
    issues.push({ code: "unsupported_job_type", reason: `Schedule job type is ${schedule.job_type}.` });
  }
  if (!project) issues.push({ code: "project_missing", reason: "Project was deleted or is unavailable." });
  else if (project.status !== "active") {
    issues.push({ code: "project_inactive", reason: `Project status is ${project.status}.` });
  }
  if (!account) issues.push({ code: "account_missing", reason: "The project owner account is unavailable." });
  if (!connection) {
    issues.push({ code: "connection_missing", reason: "The schedule's mail account was deleted or is unavailable." });
  } else if (connection.status !== "active") {
    issues.push({ code: "connection_inactive", reason: `Mail account status is ${connection.status}.` });
  } else if (!["oauth2", "smtp"].includes(connection.connection_type)) {
    issues.push({
      code: "connection_unsupported",
      reason: `Mail account connection type ${connection.connection_type} is unsupported.`,
    });
  }

  return {
    eligible: issues.length === 0,
    code: issues[0]?.code || null,
    reason: issues.map((issue) => issue.reason).join(" "),
    issues,
    schedule,
    connection,
  };
}

// Open a new attempt row and return its id.
// Returns null (without throwing) when the row already exists.
// That happens when two planDay calls race, or when the server restarts
// and re-arms an occurrence that was already queued.
export async function openAttempt({ scheduleId, runFor, attempt }) {
  const { data, error } = await supabase
    .from("schedule_runs")
    .insert({
      schedule_id: scheduleId,
      run_for: new Date(runFor).toISOString(),
      attempt,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  // 23505 = unique index violation: this occurrence + attempt number already exists.
  if (error?.code === "23505") return null;
  if (error) throw error;
  return data.id;
}

// Write the final status and close the attempt.
// 'status' is one of: 'succeeded' or 'failed'.
// 'error' is a short message string or null.
// The live schema column is 'error' (not error_message) and 'completed_at' (not finished_at).
export async function closeAttempt(runId, { status, error }) {
  const { error: err } = await supabase
    .from("schedule_runs")
    .update({
      status,
      error: error ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (err) throw err;
}

export async function getTodayScheduleRunCounts(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const startAt = start.toISOString();
  const endAt = end.toISOString();

  async function countRuns(status) {
    const { count, error } = await supabase
      .from("schedule_runs")
      .select("id", { count: "exact", head: true })
      .eq("status", status)
      .gte("started_at", startAt)
      .lt("started_at", endAt);
    if (error) throw error;
    return count || 0;
  }

  const [succeeded, failed, running] = await Promise.all([
    countRuns("succeeded"),
    countRuns("failed"),
    countRuns("running"),
  ]);
  return {
    utc_date: startAt.slice(0, 10),
    succeeded,
    failed,
    running,
  };
}

// Read the most recent attempt row for an occurrence.
// Used on restart to decide whether to retry, skip or finish.
export async function getLatestAttempt(scheduleId, runFor) {
  const { data, error } = await supabase
    .from("schedule_runs")
    .select("*")
    .eq("schedule_id", scheduleId)
    .eq("run_for", new Date(runFor).toISOString())
    .order("attempt", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Move the schedule forward after an occurrence ends.
// patch contains: last_run_at, last_failure_reason, retry_count, run_count, next_run_at, status.
export async function updateScheduleAfterOccurrence(scheduleId, projectId, patch) {
  const { error } = await supabase
    .from("schedules")
    .update(patch)
    .eq("id", scheduleId)
    .eq("project_id", projectId);
  if (error) throw error;
}

// Flag the email account as expired when Gmail revokes access mid-send.
// 'expired' is what the live email_connections status constraint allows.
// The dashboard can then prompt the user to reconnect.
export async function markConnectionNeedsReconnect(connectionId, projectId) {
  const { error } = await supabase
    .from("email_connections")
    .update({ status: "expired" })
    .eq("id", connectionId)
    .eq("project_id", projectId);
  if (error) throw error;
}