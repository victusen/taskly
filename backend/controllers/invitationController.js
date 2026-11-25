import { ProjectAccessError } from "../services/projectAccessService.js";
import {
  InvitationValidationError,
} from "../utils/invitationValidation.js";
import { createInvitations } from "../services/invitationService.js";

export const invitationController = {
  async create(req, res) {
    try {
      const invitations = await createInvitations(
        req.user.id,
        req.user.email,
        req.body,
      );
      return res.status(201).json({
        success: true,
        data: { created: invitations.length },
      });
    } catch (error) {
      if (error instanceof InvitationValidationError || error instanceof ProjectAccessError) {
        return res.status(error.status).json({
          success: false,
          code: error.code,
          message: error.message,
          fieldErrors: error.fieldErrors,
        });
      }

      console.error("[CREATE INVITATIONS]", {
        code: error.code || "UNKNOWN",
        message: error.message || "Unknown invitation insert error.",
      });
      return res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Could not save the invitation. Please try again.",
      });
    }
  },
};
