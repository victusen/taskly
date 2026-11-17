import { supabase } from "../config/supabase.js";
import { computeNextRun } from "../services/scheduleRule.js";
import { getScheduleReadiness } from "../services/scheduleRunService.js";
import { disarmSchedule } from "../workers/scheduleQueue.js";
import { syncSchedule } from "../workers/planDay.js";

function fail(res, status, code, message, fieldErrors) {
  return res.status(status).json({ success: false, code, message, fieldErrors });
}

const COLUMNS = "id, project_name, business_name, status, created_at";

// Must match the values in scheduleService.js PLAN_LIMITS.
const PROJECT_LIMITS = {
  free:     1,
  paid:     3,
  business: 10,
};


function projectLimitMessage(limit) {
  return limit === 1
    ? "Your plan allows only 1 project. Pls Upgrade to add more."
    : `Your plan allows up to ${limit} projects. Pls Upgrade to add more.`;
}

async function assertUnderProjectLimit(userId) {
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("plan_tier")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw profileError;

  const limit = PROJECT_LIMITS[profile?.plan_tier] ?? PROJECT_LIMITS.free;

  const { count, error } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["active", "paused"]);

  if (error) throw error;

  if ((count || 0) >= limit) {
    return { allowed: false, limit };
  }
  return { allowed: true, limit };
}

export const projectController = {
  async getProjects(req, res) {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select(COLUMNS)
        .eq("user_id", req.user.id)
        .in("status", ["active", "paused"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error("[GET PROJECTS]", error);
      return fail(res, 500, "SERVER_ERROR", "Could not load projects.");
    }
  },

  async createProject(req, res) {
    try {
      const enteredProjectName = typeof req.body?.project_name === "string" ? req.body.project_name.trim() : "";
      const enteredBusinessName = typeof req.body?.business_name === "string" ? req.body.business_name.trim() : "";
      const fieldErrors = {};
      if (!enteredProjectName && !enteredBusinessName) {
        fieldErrors.project_name = "Enter a project name or a business name.";
      }
      if (enteredProjectName.length > 120) fieldErrors.project_name = "Project name must be no more than 120 characters.";
      if (enteredBusinessName.length > 120) fieldErrors.business_name = "Business name must be no more than 120 characters.";
      if (Object.keys(fieldErrors).length > 0) {
        return fail(res, 400, "VALIDATION_FAILED", "Check the highlighted fields.", fieldErrors);
      }

      const projectName = enteredProjectName || enteredBusinessName;
      const businessName = enteredProjectName && enteredBusinessName ? enteredBusinessName : "";
      const { allowed, limit } = await assertUnderProjectLimit(req.user.id);
      if (!allowed) {
        return fail(res, 403, "PLAN_LIMIT_REACHED", projectLimitMessage(limit));
      }

      const { data, error } = await supabase
        .from("projects")
        .insert({ user_id: req.user.id, project_name: projectName, business_name: businessName })
        .select(COLUMNS)
        .single();

      if (error) {
        if (error.code === "P0001") {
          return fail(res, 403, "PROJECT_LIMIT_REACHED", projectLimitMessage(limit));
        }
        if (error.code === "23505") {
          return fail(res, 409, "DUPLICATE_NAME", "A project with that name already exists.");
        }
        throw error;
      }
      return res.status(201).json({ success: true, data });
    } catch (error) {
      console.error("[CREATE PROJECT]", error);
      return fail(res, 500, "SERVER_ERROR", "Could not create the project.");
    }
  },

  async deleteProject(req, res) {
    try {
      const projectId = req.params.id;
      if (!projectId) {
        return fail(res, 400, "MISSING_ID", "Project ID is required.");
      }

      const { data, error } = await supabase
        .from("projects")
        .update({ status: "deleted" })
        .eq("id", projectId)
        .eq("user_id", req.user.id)
        .in("status", ["active", "paused"])
        .select(COLUMNS)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return fail(res, 404, "NOT_FOUND", "Project not found or already deleted.");
      }

      return res.status(200).json({ success: true, message: "Project deleted successfully", data });
    } catch (error) {
      console.error("[DELETE PROJECT]", error);
      return fail(res, 500, "SERVER_ERROR", "Could not delete project.");
    }
  },

  async updateProjectStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body || {};
      if (!id) return fail(res, 400, "MISSING_ID", "Project ID is required.");
      if (!["active", "paused"].includes(status)) {
        return fail(res, 400, "INVALID_STATUS", "Project status must be active or paused.");
      }

      const { data: current, error: currentError } = await supabase
        .from("projects")
        .select(COLUMNS)
        .eq("id", id)
        .eq("user_id", req.user.id)
        .in("status", ["active", "paused"])
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current) return fail(res, 404, "NOT_FOUND", "Project not found or already deleted.");
      if (current.status === status) return res.status(200).json({ success: true, data: current, warnings: [] });

      const { data: schedules, error: schedulesError } = await supabase
        .from("schedules")
        .select("*")
        .eq("project_id", id)
        .in("status", ["active", "paused"]);
      if (schedulesError) throw schedulesError;

      const { data: updated, error: updateError } = await supabase
        .from("projects")
        .update({ status })
        .eq("id", id)
        .eq("user_id", req.user.id)
        .in("status", ["active", "paused"])
        .select(COLUMNS)
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated) return fail(res, 404, "NOT_FOUND", "Project not found or already deleted.");

      if (status === "paused") {
        for (const schedule of schedules || []) disarmSchedule(schedule.id);
        return res.status(200).json({ success: true, data: updated, warnings: [] });
      }

      if (process.env.ENABLE_SCHEDULER !== "true") {
        return res.status(200).json({ success: true, data: updated, warnings: [] });
      }

      const warnings = [];
      try {
        for (const originalSchedule of schedules || []) {
          if (originalSchedule.status !== "active") continue;
          const readiness = await getScheduleReadiness(originalSchedule.id, id);
          if (!readiness.eligible) {
            const reason = readiness.reason || "Schedule is not ready to run.";
            warnings.push({ schedule_id: originalSchedule.id, reason });
            console.warn(`[PROJECT RESUME] schedule ${originalSchedule.id} not re-armed: ${reason}`);
            continue;
          }

          let schedule = readiness.schedule;
          if (schedule.next_run_at && new Date(schedule.next_run_at).getTime() <= Date.now()) {
            const nextRunAt = computeNextRun(schedule, new Date());
            if (!nextRunAt) {
              const reason = "The send time passed while the project was paused. Edit this schedule to choose a new time.";
              const { error } = await supabase
                .from("schedules")
                .update({ status: "paused", next_run_at: null, last_failure_reason: reason })
                .eq("id", schedule.id)
                .eq("project_id", id)
                .eq("status", "active");
              if (error) throw error;
              warnings.push({ schedule_id: schedule.id, reason });
              continue;
            }

            const { error } = await supabase
              .from("schedules")
              .update({ next_run_at: nextRunAt })
              .eq("id", schedule.id)
              .eq("project_id", id)
              .eq("status", "active");
            if (error) throw error;
            schedule = { ...schedule, next_run_at: nextRunAt };
          }

          await syncSchedule(schedule);
        }
      } catch (error) {
        const { error: rollbackError } = await supabase
          .from("projects")
          .update({ status: "paused" })
          .eq("id", id)
          .eq("user_id", req.user.id)
          .eq("status", "active");
        for (const schedule of schedules || []) disarmSchedule(schedule.id);
        if (rollbackError) console.error("[PROJECT RESUME ROLLBACK]", rollbackError);
        throw error;
      }

      return res.status(200).json({ success: true, data: updated, warnings });
    } catch (error) {
      console.error("[UPDATE PROJECT STATUS]", error);
      return fail(res, 500, "SERVER_ERROR", "Could not update project status.");
    }
  },
};