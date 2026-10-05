import {
  authenticatedFetch,
} from "../auth/api.js";

export async function getSchedules() {

  return authenticatedFetch(
    "/api/schedules",
    {
      method: "GET",
    }
  );
}

export async function createSchedule(
  schedule
) {

  return authenticatedFetch(
    "/api/schedules",
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body:
        JSON.stringify(schedule),
    }
  );
}