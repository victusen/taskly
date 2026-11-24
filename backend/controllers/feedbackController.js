import { supabase } from "../config/supabase.js";
import {
  FeedbackValidationError,
  normalizeFeedbackSubmission,
} from "../utils/feedbackValidation.js";

export const feedbackController = {
  async submit(req, res) {
    let feedback;
    try {
      feedback = normalizeFeedbackSubmission(req.body);
    } catch (error) {
      if (error instanceof FeedbackValidationError) {
        return res.status(400).json({
          success: false,
          code: "VALIDATION_FAILED",
          message: error.message,
          fieldErrors: error.fieldErrors,
        });
      }
      throw error;
    }

    try {
      const { data, error } = await supabase
        .from("feedback")
        .insert(feedback)
        .select("id, status, created_at")
        .single();
      if (error) throw error;

      return res.status(201).json({
        success: true,
        data: {
          id: data.id,
          status: data.status,
          created_at: data.created_at,
        },
      });
    } catch (error) {
      console.error("[SUBMIT FEEDBACK]", { code: error.code || "UNKNOWN" });
      return res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "We could not send your feedback. Please try again.",
      });
    }
  },
};
