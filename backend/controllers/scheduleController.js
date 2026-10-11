import {
  scheduleService,
} from "../services/scheduleService.js";

export const scheduleController = {
  async getSchedules(userId) {
    const { data, error } = await supabase
      .from("schedules")
      .select(COLUMNS)
      .eq("user_id", userId)
      .order("next_run_at", { ascending: true, nullsFirst: false })
      .limit(200);

    if (error) {
      throw error;
    }

    return data;
  },

  async createSchedule(userId, input) {
    // 1. Validate and clean every field. Throws ValidationError with a message per field.
    const value = validateScheduleInput(input);

    // 2. The project must belong to this user.
    const projectId = String(input.project_id || "");

    if (!UUID.test(projectId)) {
      throw new ValidationError({ project_id: "Open a project first." });
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (projectError) {
      throw projectError;
    }

    if (!project) {
      throw new ValidationError({ project_id: "That project was not found." });
    }

    // 3. The mail account must belong to this user and be active.
    const { data: connection, error: connectionError } = await supabase
      .from("email_connections")
      .select("id, status")
      .eq("id", value.email_connection_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (connectionError) {
      throw connectionError;
    }

    if (!connection) {
      throw new ValidationError({
        email_connection_id: "Choose one of your connected mail accounts.",
      });
    }

    if (connection.status !== "active") {
      throw new ValidationError({
        email_connection_id: "This mail account needs to be reconnected.",
      });
    }

    // 4. Plan limit.
    const { count, error: countError } = await supabase
      .from("schedules")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["active", "paused"]);

    if (countError) {
      throw countError;
    }

    if ((count || 0) >= MAX_ACTIVE_SCHEDULES) {
      throw new PlanLimitError(MAX_ACTIVE_SCHEDULES);
    }

    // 5. Insert. The backend sets user_id, project_id and status. The browser never sets them.
    const { data, error } = await supabase
      .from("schedules")
      .insert({
        user_id: userId,
        project_id: project.id,
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

    if (error) {
      throw error;
    }

    return data;
  },
};