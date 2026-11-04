import { supabase } from "../auth/auth.js";
import { authenticatedFetch } from "../auth/api.js";
import { BACKEND_URL } from "../config.js";

const PROJECT_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

export async function addEmailConnection({ projectId, emailAddress, host, port, secure, username, password }) {
  if (!PROJECT_ID_PATTERN.test(String(projectId ?? ""))) {
    throw new Error("This mail account must be connected from a project.");
  }

  return authenticatedFetch("/api/email-connections", {
    method: "POST",
    body: JSON.stringify({ projectId, emailAddress, host, port, secure, username, password }),
  });
}

export async function startGoogleConnection(projectId) {
  if (!PROJECT_ID_PATTERN.test(String(projectId ?? ""))) {
    throw new Error("This mail account must be connected from a project.");
  }

  const body = await authenticatedFetch(
    `/api/email-connections/google/start?project_id=${encodeURIComponent(projectId)}`,
    { method: "GET" }
  );

  if (!body.authorizationUrl) {
    throw new Error("Google authorization URL was not returned.");
  }
  window.location.href = body.authorizationUrl;
}

export async function listEmailConnections() {
  const body = await authenticatedFetch("/api/email-connections", {
    method: "GET",
  });

  return Array.isArray(body.data) ? body.data : [];
}