// backend/services/scheduleRunsService.js
// Talks to the real Supabase database. Uses service-role key so RLS does not block writes.
// Column names here must match the live schema exactly.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Read the current state of a schedule.
// Returns null if the row does not exist or belongs to a different user.
export async function getScheduleStatus(scheduleId, userId) {
  const { data, error } = await supabase
    .from("schedules")
    .select("*")
    .eq("id", scheduleId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Read the email account the schedule sends through.
// Returns null if deleted or belongs to a different user.
export async function getActiveConnection(connectionId, userId) {
  const { data, error } = await supabase
    .from("email_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Open a new attempt row and return its id.
// Returns null (without throwing) when the row already exists.
// That happens when two planDay calls race, or when the server restarts
// and re-arms an occurrence that was already queued.
export async function openAttempt({ scheduleId, userId, runFor, attempt }) {
  const { data, error } = await supabase
    .from("schedule_runs")
    .insert({
      schedule_id: scheduleId,
      user_id: userId,
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
// 'status' is one of: 'sent', 'failed', 'skipped'.
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
export async function updateScheduleAfterOccurrence(scheduleId, userId, patch) {
  const { error } = await supabase
    .from("schedules")
    .update(patch)
    .eq("id", scheduleId)
    .eq("user_id", userId);
  if (error) throw error;
}

// Flag the email account as expired when Gmail revokes access mid-send.
// 'expired' is what the live email_connections status constraint allows.
// The dashboard can then prompt the user to reconnect.
export async function markConnectionNeedsReconnect(connectionId, userId) {
  const { error } = await supabase
    .from("email_connections")
    .update({ status: "expired" })
    .eq("id", connectionId)
    .eq("user_id", userId);
  if (error) throw error;
}