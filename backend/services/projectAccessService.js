import { supabase } from "../config/supabase.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ProjectAccessError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function assertProjectAccess(
  userId,
  projectId,
  { allowedStatuses = ["active"] } = {},
) {
  if (!UUID_PATTERN.test(String(projectId || ""))) {
    throw new ProjectAccessError(400, "INVALID_PROJECT", "A valid project is required.");
  }

  const { data, error } = await supabase
    .from("projects")
    .select("id, status")
    .eq("id", projectId)
    .eq("user_id", userId)
    .in("status", allowedStatuses)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new ProjectAccessError(
      404,
      "NOT_FOUND",
      "Project not found or you do not have permission to access it.",
    );
  }
  return data;
}
