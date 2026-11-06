import { authenticatedFetch } from "../auth/api.js";

export function getSchedules(projectId, { page = 1, pageSize = 5, filter = "all", jobType = "email" } = {}) {
  const query = new URLSearchParams({
    project_id: projectId,
    page: String(page),
    page_size: String(pageSize),
    filter,
    job_type: jobType,
  });
  return authenticatedFetch(`/api/schedules?${query}`, { method: "GET" });
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

export function sendNow(payload) {
  return authenticatedFetch("/api/send-now", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}