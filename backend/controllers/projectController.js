import { supabase } from "../config/supabase.js";

export const projectController = {
  async getProjects(req, res) {
    try {
      const userId = req.user.id;

      const { data, error } = await supabase
        .from("projects")
        .select("id, name, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) {
        throw error;
      }

      if (data.length > 0) {
        return res.status(200).json({ success: true, data });
      }

      const { data: created, error: createError } = await supabase
        .from("projects")
        .insert({ user_id: userId, name: "My project" })
        .select("id, name, created_at");

      if (createError) {
        throw createError;
      }

      return res.status(200).json({ success: true, data: created });
    } catch (error) {
      console.error("[GET PROJECTS]", error);

      return res.status(500).json({
        success: false,
        message: "Could not load projects.",
      });
    }
  },
};