import { authenticatedFetch } from "../auth/api.js";

export function createInvitations(invitation) {
  return authenticatedFetch("/api/invitations", {
    method: "POST",
    body: JSON.stringify(invitation),
  });
}
