import { scheduleService } from "../services/scheduleService.js";

function sendError(res, error, tag) {
  if (error && error.status && error.status < 500 && error.code) {
    return res.status(error.status).json({ success: false, code: error.code, message: error.message, fieldErrors: error.fieldErrors });
  }
  console.error(tag, error);
  return res.status(500).json({ success: false, code: "SERVER_ERROR", message: "Something went wrong. Please try again." });
}

/* Wraps one service call: success returns { success, data }, any error goes through sendError. */
function handle(tag, run, okStatus = 200) {
  return async (req, res) => {
    try {
      const data = await run(req);
      return res.status(okStatus).json({ success: true, data });
    } catch (error) {
      return sendError(res, error, tag);
    }
  };
}

export const scheduleController = {
  getSchedules: handle("[GET SCHEDULES]", (req) => scheduleService.getSchedules(req.user.id, req.query.project_id)),
  createSchedule: handle("[CREATE SCHEDULE]", (req) => scheduleService.createSchedule(req.user.id, req.body), 201),
  updateSchedule: handle("[UPDATE SCHEDULE]", (req) => scheduleService.updateSchedule(req.user.id, req.params.id, req.body)),
  pauseSchedule: handle("[PAUSE SCHEDULE]", (req) => scheduleService.pauseSchedule(req.user.id, req.params.id)),
  resumeSchedule: handle("[RESUME SCHEDULE]", (req) => scheduleService.resumeSchedule(req.user.id, req.params.id)),
  cancelSchedule: handle("[CANCEL SCHEDULE]", (req) => scheduleService.cancelSchedule(req.user.id, req.params.id)),
};