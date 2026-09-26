import { scheduleService } from '../services/scheduleService.js';

export const scheduleController = {
  async getSchedules(req, res) {
    try {
      const userId = req.user.id;

      const schedules =
        await scheduleService.getSchedules(userId);

      return res.status(200).json({
        success: true,
        data: schedules
      });

    } catch (error) {
      console.error('[GET SCHEDULES]', error);

      return res.status(500).json({
        success: false,
        code: 'SCHEDULE_FETCH_FAILED',
        message: 'Unable to retrieve your schedules.'
      });
    }
  },

  async createSchedule(req, res) {
    try {
      const userId = req.user.id;

      const schedule =
        await scheduleService.createSchedule(
          userId,
          req.body
        );

      return res.status(201).json({
        success: true,
        message: 'Schedule created successfully.',
        data: schedule
      });

    } catch (error) {
      console.error('[CREATE SCHEDULE]', error);

      return res.status(500).json({
        success: false,
        code: 'SCHEDULE_CREATE_FAILED',
        message: 'Unable to create schedule.'
      });
    }
  }
};