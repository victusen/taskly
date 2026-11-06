import { authenticatedFetch } from "../auth/api.js";

const PROJECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function addEmailConnection({ projectId, emailAddress, host, port, secure, username, password }) {
  if (!PROJECT_ID_PATTERN.test(String(projectId ?? ""))) {
    throw new Error("This mail account must be connected from a project.");
  }

  return authenticatedFetch("/api/email-connections", {
    method: "POST",
    body: JSON.stringify({ projectId, emailAddress, host, port, secure, username, password }),
  });
}

export async function startGoogleConnection(projectId, purpose = "mail") {
  if (!PROJECT_ID_PATTERN.test(String(projectId ?? ""))) {
    throw new Error("This mail account must be connected from a project.");
  }

  const query = new URLSearchParams({ project_id: projectId });
  if (purpose === "database") query.set("purpose", purpose);

  const body = await authenticatedFetch(
    `/api/email-connections/google/start?${query}`,
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

export async function getProjectEmailConnection(projectId) {
  if (!PROJECT_ID_PATTERN.test(String(projectId ?? ""))) {
    throw new Error("A valid project is required to load its mail account.");
  }
  const body = await authenticatedFetch(
    `/api/email-connections/project/${encodeURIComponent(projectId)}`,
    { method: "GET" }
  );
  return body.data || null;
}