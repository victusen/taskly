import {
  scheduleService,
} from "../services/scheduleService.js";

export const scheduleController = {

  async getSchedules(
    req,
    res
  ) {
    try {

      const schedules =
        await scheduleService.getSchedules(
          req.user.id
        );

      return res.status(200).json({
        success: true,
        data: schedules,
      });

    } catch (error) {

      console.error(
        "[GET SCHEDULES]",
        error
      );

      return res.status(500).json({
        success: false,
        code:
          "SCHEDULE_FETCH_FAILED",
        message:
          "Unable to retrieve your schedules.",
      });
    }
  },

  async createSchedule(
    req,
    res
  ) {
    try {

      const schedule =
        await scheduleService.createSchedule(
          req.user.id,
          req.body
        );

      return res.status(201).json({
        success: true,
        message:
          "Schedule created successfully.",
        data: schedule,
      });

    } catch (error) {

      console.error(
        "[CREATE SCHEDULE]",
        error
      );

      /*
       * Validation errors from
       * our service are client errors.
       */

      return res.status(400).json({
        success: false,
        code:
          "INVALID_SCHEDULE",
        message:
          error.message ||
          "Invalid schedule.",
      });
    }
  },
};