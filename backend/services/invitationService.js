import { randomBytes } from "node:crypto";
import { supabase } from "../config/supabase.js";
import { assertProjectAccess } from "./projectAccessService.js";
import { normalizeInvitationInput } from "../utils/invitationValidation.js";

const INVITATION_COLUMNS =
  "id, invited_email, role, scope, project_id, status, expires_at, created_at";

export async function createInvitations(inviterId, inviterEmail, input) {
  const invitation = normalizeInvitationInput(input, inviterEmail);

  if (invitation.scope === "project") {
    await assertProjectAccess(inviterId, invitation.project_id, {
      allowedStatuses: ["active"],
    });
  }

  const rows = invitation.emails.map((invitedEmail) => ({
    inviter_id: inviterId,
    invited_email: invitedEmail,
    role: invitation.role,
    scope: invitation.scope,
    project_id: invitation.project_id,
    personal_note: invitation.personal_note,
    token_hash: randomBytes(32).toString("hex"),
  }));

  const { data, error } = await supabase
    .from("invitations")
    .insert(rows)
    .select(INVITATION_COLUMNS);

  if (error) throw error;
  return data || [];
}
