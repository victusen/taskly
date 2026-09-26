import { authenticatedFetch } from '../auth/api.js';

export async function getSchedules() {
  return authenticatedFetch(
    '/api/schedules',
    {
      method: 'GET'
    }
  );
}

export async function createSchedule(scheduleData) {
  return authenticatedFetch(
    '/api/schedules',
    {
      method: 'POST',
      body: JSON.stringify(scheduleData)
    }
  );
}