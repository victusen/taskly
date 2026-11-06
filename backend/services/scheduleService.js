import { supabase } from "../config/supabase.js";
import {
  UUID_PATTERN,
  ValidationError,
  validateScheduleInput,
} from "./scheduleValidation.js";
import { computeNextRun } from "./scheduleRule.js";
import { syncSchedule } from "../workers/planDay.js";

/* Active plus paused schedules one user may hold, by plan_tier. Change the numbers when pricing is decided. */ 
const PLAN_LIMITS = {
  free:     { schedules: 5,  projects: 1  },
  paid:     { schedules: 20, projects: 3  },
  business: { schedules: 50, projects: 10 },
};

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
    throw new ServiceError(404, "NOT_FOUND", "Project not found or you do not have permission to access it.");
  }
}

async function getOwnedProjectIds(userId) {
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) throw error;
  return (data || []).map((project) => project.id);
}

/* The mail account must belong to this user's project and be usable. */
async function assertConnection(userId, projectId, connectionId) {
  const { data, error } = await supabase
    .from("email_connections")
    .select("id, project_id, status")
    .eq("id", connectionId)
    .maybeSingle();

  if (error) throw error;

  if (!data || data.project_id !== projectId) {
    throw new ValidationError({ email_connection_id: "Choose one of your connected mail accounts." });
  }

  await assertProject(userId, projectId);

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

  const limits = PLAN_LIMITS[profile?.plan_tier] ?? PLAN_LIMITS.free;

  const projectIds = await getOwnedProjectIds(userId);
  if (projectIds.length === 0) return;

  const { count, error } = await supabase
    .from("schedules")
    .select("id", { count: "exact", head: true })
    .in("project_id", projectIds)
    .in("status", ["active", "paused"]);

  if (error) throw error;

  if ((count || 0) >= limits.schedules) {
    throw new ServiceError(
      403,
      "PLAN_LIMIT_REACHED",
      `Your plan allows ${limits.schedules} active schedules. Upgrade to add more.`
    );
  }
}

/*
 * The schedule has no user_id column; ownership is enforced through its project.
 */
async function changeStatus(userId, id, from, patch) {
  assertUuid(id, "id");

  const { data: row, error: rowError } = await supabase
    .from("schedules")
    .select("id, project_id, status")
    .eq("id", id)
    .maybeSingle();
  if (rowError) throw rowError;
  if (!row) throw notFound();
  await assertProject(userId, row.project_id);

  const { data, error } = await supabase
    .from("schedules")
    .update(patch)
    .eq("id", id)
    .eq("project_id", row.project_id)
    .in("status", from)
    .select(COLUMNS)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const { data: exists, error: existsError } = await supabase
      .from("schedules")
      .select("id, project_id, status")
      .eq("id", id)
      .maybeSingle();

    if (existsError) throw existsError;
    if (!exists || exists.project_id !== row.project_id) throw notFound();

    throw new ServiceError(409, "INVALID_STATE", `This schedule is ${exists.status} and cannot be changed that way.`);
  }

  return data;
}

export const scheduleService = {
  async getSchedules(userId, projectId, options = {}) {
    assertUuid(projectId, "project_id");
    await assertProject(userId, projectId);

    const page = Number(options.page || 1);
    const pageSize = Number(options.pageSize || 5);
    const filter = String(options.filter || "all");
    const jobType = String(options.jobType || "email");
    if (!Number.isInteger(page) || page < 1) {
      throw new ValidationError({ page: "Page must be a positive integer." });
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
      throw new ValidationError({ page_size: "Page size must be between 1 and 50." });
    }
    if (!["all", "running", "new", "paused"].includes(filter)) {
      throw new ValidationError({ filter: "Invalid schedule filter." });
    }
    if (!["email", "payload"].includes(jobType)) {
      throw new ValidationError({ job_type: "Invalid schedule type." });
    }

    let query = supabase
      .from("schedules")
      .select(COLUMNS, { count: "exact" })
      .eq("project_id", projectId)
      .neq("status", "cancelled")
      .eq("job_type", jobType)
      .order("next_run_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (filter === "running") query = query.eq("status", "active");
    if (filter === "paused") query = query.eq("status", "paused");
    if (filter === "new") query = query.eq("run_count", 0);

    const offset = (page - 1) * pageSize;
    const { data, error, count } = await query.range(offset, offset + pageSize - 1);
    if (error) throw error;

    const total = count || 0;
    return {
      items: data || [],
      page,
      pageSize,
      total,
      hasMore: offset + (data || []).length < total,
    };
  },

  async createSchedule(userId, input) {
    /* Validates and cleans everything. Throws ValidationError with a message per field. */
    const value = validateScheduleInput(input);

    await assertProject(userId, value.project_id);
    await assertConnection(userId, value.project_id, value.email_connection_id);
    await assertUnderPlanLimit(userId);

    /* The browser never sets status, run_count or next_run_at. */
    const { data, error } = await supabase
      .from("schedules")
      .insert({
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

    if (process.env.ENABLE_SCHEDULER === "true") {
      syncSchedule(data);
    }

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
      .maybeSingle();

    if (error) throw error;
    if (!row) throw notFound();
    await assertProject(userId, row.project_id);

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

    await assertConnection(userId, row.project_id, value.email_connection_id);

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

    const updated = await changeStatus(userId, id, ["active", "paused", "failed"], changes);

    if (process.env.ENABLE_SCHEDULER === "true") {
      syncSchedule(updated);
    }
    return updated;
  },

  async pauseSchedule(userId, id) {
    const updated = await changeStatus(userId, id, ["active"], { status: "paused" });
  
    if (process.env.ENABLE_SCHEDULER === "true") {
      syncSchedule(updated);
    }
  
    return updated;
  },

  async resumeSchedule(userId, id) {
    assertUuid(id, "id");

    const { data: row, error } = await supabase
      .from("schedules")
      .select("project_id, schedule_type, scheduled_for, schedule_rule, timezone")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!row) throw notFound();
    await assertProject(userId, row.project_id);

    /* Time kept passing while it was paused. Skip missed runs and find the next real one. */
    const nextRunAt = computeNextRun(row, new Date());

    if (!nextRunAt) {
      throw new ServiceError(409, "INVALID_STATE", "The send time has passed. Edit the schedule and pick a new time.");
    }

    const updated = await changeStatus(userId, id, ["paused"], { status: "active", next_run_at: nextRunAt });

    if (process.env.ENABLE_SCHEDULER === "true") {
      syncSchedule(updated);
    }
  
    return updated;
  },

  /* "Delete" in the app. The row stays for history, the schedule never runs again. */
  async cancelSchedule(userId, id) {
    const updated = await changeStatus(userId, id, ["active", "paused", "failed"], {
      status: "cancelled",
      next_run_at: null,
    });
  
    if (process.env.ENABLE_SCHEDULER === "true") {
      syncSchedule(updated);
    }
  
    return updated;
  },
};