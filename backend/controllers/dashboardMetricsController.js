import { DashboardMetricsError } from "../services/dashboardMetricsAggregation.js";
import { getDashboardScheduleMetrics } from "../services/dashboardMetricsService.js";

export const dashboardMetricsController = {
  async getScheduleMetrics(req, res) {
    try {
      const data = await getDashboardScheduleMetrics(req.user.id, req.query.period || "7d");
      return res.status(200).json({ success: true, data });
    } catch (error) {
      if (error instanceof DashboardMetricsError) {
        return res.status(error.status).json({
          success: false,
          code: error.code,
          message: error.message,
        });
      }

      console.error("[GET DASHBOARD SCHEDULE METRICS]", error);
      return res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Could not load schedule metrics.",
      });
    }
  },
};
