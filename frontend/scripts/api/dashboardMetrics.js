import { authenticatedFetch } from "../auth/api.js";

export async function getDashboardScheduleMetrics(period = "7d") {
  const query = new URLSearchParams({ period });
  const response = await authenticatedFetch(`/api/dashboard/schedule-metrics?${query}`);
  return response.data;
}
