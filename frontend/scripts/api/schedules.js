import { authenticatedFetch } from "../auth/api.js";

export function getSchedules(projectId) {
  return authenticatedFetch(`/api/schedules?project_id=${encodeURIComponent(projectId)}`, { method: "GET" });
}

export function createSchedule(schedule) {
  return authenticatedFetch("/api/schedules", { method: "POST", body: JSON.stringify(schedule) });
}

export function updateSchedule(id, schedule) {
  return authenticatedFetch(`/api/schedules/${id}`, { method: "PATCH", body: JSON.stringify(schedule) });
}

export function pauseSchedule(id) {
  return authenticatedFetch(`/api/schedules/${id}/pause`, { method: "POST" });
}

export function resumeSchedule(id) {
  return authenticatedFetch(`/api/schedules/${id}/resume`, { method: "POST" });
}

export function cancelSchedule(id) {
  return authenticatedFetch(`/api/schedules/${id}`, { method: "DELETE" });
}