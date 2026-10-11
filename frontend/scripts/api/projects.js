import { authenticatedFetch } from "../auth/api.js";

export function getProjects() {
  return authenticatedFetch("/api/projects", {
    method: "GET",
  });
}
