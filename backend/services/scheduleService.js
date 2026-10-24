import { supabase } from "../config/supabase.js";

import {
  UUID_PATTERN,
  ValidationError,
  validateScheduleInput,
} from "./scheduleValidation.js";

import { computeNextRun } from "./scheduleRule.js";

/* Active plus paused schedules one user may hold, by plan_tier. Change the numbers when pricing is decided. */
const PLAN_LIMITS = { free: 5, paid: 50 };

class ServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const notFound = () => new ServiceError(404, "NOT_FOUND", "Schedule not found.");

const COLUMNS = `
  id, project_id, name, job_type, status, schedule_type, schedule_rule,
  timezone, config, scheduled_for, next_run_at, last_run_at, run_count,
  retry_count, last_failure_reason, email_connection_id, created_at, updated_at
`;

function assertUuid(value, field) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ValidationError({ [field]: "Invalid id." });
  }
}

/* The project must belong to this user and not be deleted. */
async function assertProject(userId, projectId) {
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new ValidationError({ project_id: "Project not found." });
  }
}

/* The mail account must belong to this user and be usable. */
async function assertConnection(userId, connectionId) {
  const { data, error } = await supabase
    .from("email_connections")
    .select("id, status")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new ValidationError({ email_connection_id: "Choose one of your connected mail accounts." });
  }

  if (data.status !== "active") {
    throw new ValidationError({ email_connection_id: "This mail account needs to be reconnected." });
  }
}

async function assertUnderPlanLimit(userId) {
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("plan_tier")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw profileError;

  const limit = PLAN_LIMITS[profile?.plan_tier] ?? PLAN_LIMITS.free;

  const { count, error } = await supabase
    .from("schedules")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["active", "paused"]);

  if (error) throw error;

  if ((count || 0) >= limit) {
    throw new ServiceError(
      403,
      "PLAN_LIMIT_REACHED",
      `Your plan allows ${limit} active schedules. Upgrade to add more.`
    );
  }
}

/*
 * One atomic status change: the row changes only if it belongs to the user AND is still in
 * one of the `from` statuses. Two quick clicks cannot both succeed.
 */
async function changeStatus(userId, id, from, patch) {
  assertUuid(id, "id");

  const { data, error } = await supabase
    .from("schedules")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId)
    .in("status", from)
    .select(COLUMNS)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const { data: exists, error: existsError } = await supabase
      .from("schedules")
      .select("id, status")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (existsError) throw existsError;
    if (!exists) throw notFound();

    throw new ServiceError(409, "INVALID_STATE", `This schedule is ${exists.status} and cannot be changed that way.`);
  }

  return data;
}

export const scheduleService = {
  async getSchedules(userId, projectId) {
    assertUuid(projectId, "project_id");
    await assertProject(userId, projectId);

    const { data, error } = await supabase
      .from("schedules")
      .select(COLUMNS)
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .neq("status", "cancelled")
      .order("next_run_at", { ascending: true, nullsFirst: false })
      .limit(200);

    if (error) throw error;

    return data;
  },

  async createSchedule(userId, input) {
    /* Validates and cleans everything. Throws ValidationError with a message per field. */
    const value = validateScheduleInput(input);

    await assertProject(userId, value.project_id);
    await assertConnection(userId, value.email_connection_id);
    await assertUnderPlanLimit(userId);

    /* Only fields the backend chose. The browser never sets user_id, status, run_count or next_run_at. */
    const { data, error } = await supabase
      .from("schedules")
      .insert({
        user_id: userId,
        project_id: value.project_id,
        status: "active",
        name: value.name,
        job_type: value.job_type,
        schedule_type: value.schedule_type,
        schedule_rule: value.schedule_rule,
        timezone: value.timezone,
        scheduled_for: value.scheduled_for,
        next_run_at: value.next_run_at,
        email_connection_id: value.email_connection_id,
        config: value.config,
      })
      .select(COLUMNS)
      .single();

    if (error) throw error;

    return data;
  },

  /* Edit: the same rules as create. Allowed only while the schedule is active, paused or failed. */
    /* Partial edit: send only the fields that changed. Missing fields keep their stored value. */
  async updateSchedule(userId, id, patch) {
    assertUuid(id, "id");

    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      throw new ValidationError({ _form: "Nothing to update." });
    }

    const { data: row, error } = await supabase
      .from("schedules")
      .select(COLUMNS)
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    if (!row) throw notFound();

    const timingKeys = ["schedule_type", "scheduled_for", "timezone", "schedule_rule"];
    const changesTiming = timingKeys.some((key) => patch[key] !== undefined);

    /* Stored values fill every field the caller did not send. The merged result is validated as a whole. */
    const merged = {
      project_id: row.project_id,
      job_type: row.job_type,
      name: patch.name !== undefined ? patch.name : row.name,
      email_connection_id: patch.email_connection_id ?? row.email_connection_id,
      config: { ...row.config, ...(patch.config && typeof patch.config === "object" ? patch.config : {}) },
      timezone: patch.timezone ?? row.timezone,
      /* No timing change: validate as "immediate" so only the content is checked, then ignore the timing result. */
      schedule_type: changesTiming ? patch.schedule_type : "immediate",
      scheduled_for: patch.scheduled_for,
      schedule_rule: patch.schedule_rule,
    };

    const value = validateScheduleInput(merged);

    await assertConnection(userId, value.email_connection_id);

    const changes = {
      name: value.name,
      email_connection_id: value.email_connection_id,
      config: value.config,
    };

    /* Timing is rewritten only when the caller sent it. */
    if (changesTiming) {
      Object.assign(changes, {
        schedule_type: value.schedule_type,
        schedule_rule: value.schedule_rule,
        timezone: value.timezone,
        scheduled_for: value.scheduled_for,
        next_run_at: value.next_run_at,
      });
    }

    /* A failed schedule that is edited gets another chance. Paused and active keep their status. */
    if (row.status === "failed") {
      Object.assign(changes, { status: "active", retry_count: 0, last_failure_reason: null });
    }

    return changeStatus(userId, id, ["active", "paused", "failed"], changes);
  },

  async pauseSchedule(userId, id) {
    return changeStatus(userId, id, ["active"], { status: "paused" });
  },

  async resumeSchedule(userId, id) {
    assertUuid(id, "id");

    const { data: row, error } = await supabase
      .from("schedules")
      .select("schedule_type, scheduled_for, schedule_rule, timezone")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    if (!row) throw notFound();

    /* Time kept passing while it was paused. Skip missed runs and find the next real one. */
    const nextRunAt = computeNextRun(row, new Date());

    if (!nextRunAt) {
      throw new ServiceError(409, "INVALID_STATE", "The send time has passed. Edit the schedule and pick a new time.");
    }

    return changeStatus(userId, id, ["paused"], { status: "active", next_run_at: nextRunAt });
  },

  /* "Delete" in the app. The row stays for history, the schedule never runs again. */
  async cancelSchedule(userId, id) {
    return changeStatus(userId, id, ["active", "paused", "failed"], {
      status: "cancelled",
      next_run_at: null,
    });
  },
};