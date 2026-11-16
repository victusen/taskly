import { supabase } from "../config/supabase.js";

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
    .eq("status", "active");

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
        .eq("status", "active")
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
};