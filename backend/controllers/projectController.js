import { supabase } from "../config/supabase.js";

function fail(res, status, code, message, fieldErrors) {
  return res.status(status).json({ success: false, code, message, fieldErrors });
}

const COLUMNS = "id, project_name, business_name, status, created_at";

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
      const projectName = typeof req.body?.project_name === "string" ? req.body.project_name.trim() : "";
      const businessName = typeof req.body?.business_name === "string" ? req.body.business_name.trim() : "";
      const fieldErrors = {};
      if (projectName.length < 1 || projectName.length > 120) fieldErrors.project_name = "Project name must be 1 to 120 characters.";
      if (businessName.length < 1 || businessName.length > 120) fieldErrors.business_name = "Business name must be 1 to 120 characters.";
      if (Object.keys(fieldErrors).length > 0) {
        return fail(res, 400, "VALIDATION_FAILED", "Check the highlighted fields.", fieldErrors);
      }

      const { data, error } = await supabase
        .from("projects")
        .insert({ user_id: req.user.id, project_name: projectName, business_name: businessName })
        .select(COLUMNS)
        .single();

      if (error) {
        if (error.code === "23505") {
          return fail(res, 409, "PROJECT_LIMIT_REACHED", "Your plan allows one project.");
        }
        throw error;
      }
      return res.status(201).json({ success: true, data });
    } catch (error) {
      console.error("[CREATE PROJECT]", error);
      return fail(res, 500, "SERVER_ERROR", "Could not create the project.");
    }
  },
};