import { authenticatedFetch } from "../auth/api.js";

export function createProject(project) {
  return authenticatedFetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project),
  });
}