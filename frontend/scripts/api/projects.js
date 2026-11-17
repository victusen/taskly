import { authenticatedFetch } from "../auth/api.js";

export function getProjects() {
  return authenticatedFetch("/api/projects", { method: "GET" });
}

export function createProject(project) {
  return authenticatedFetch("/api/projects", {
    method: "POST",
    body: JSON.stringify(project),
  });
}

export function deleteProject(id) {
  return authenticatedFetch(`/api/projects/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function updateProjectStatus(id, status) {
  return authenticatedFetch(`/api/projects/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}