import { scheduleService } from "../services/scheduleService.js";

function sendError(res, error, tag) {
  if (error && error.status && error.status < 500 && error.code) {
    return res.status(error.status).json({ success: false, code: error.code, message: error.message, fieldErrors: error.fieldErrors });
  }
  console.error(tag, error);
  return res.status(500).json({ success: false, code: "SERVER_ERROR", message: "Something went wrong. Please try again." });
}

export const scheduleController = {
  async getSchedules(req, res) {
    try {
      const data = await scheduleService.getSchedules(req.user.id, req.query.project_id);
      return res.status(200).json({ success: true, data });
    } catch (error) { return sendError(res, error, "[GET SCHEDULES]"); }
  },
  async createSchedule(req, res) {
    try {
      const data = await scheduleService.createSchedule(req.user.id, req.body);
      return res.status(201).json({ success: true, data });
    } catch (error) { return sendError(res, error, "[CREATE SCHEDULE]"); }
  },
};