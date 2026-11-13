import express from 'express';
import cors from "cors";
import dotenv from 'dotenv';
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import authRoute from "./routes/authRoute.js";
import accountRoute from "./routes/accountRoute.js";
import scheduleRoute from './routes/scheduleRoute.js';
import projectRoute from "./routes/projectRoute.js";
import emailConnectionRoute from './routes/emailConnectionRoute.js';
import googleSheetsRoute from './routes/googleSheetsRoute.js';
import { startScheduler } from "./workers/startScheduler.js";
import { getPlannerStatus } from "./workers/planDay.js";
import { getBillingExpiryStatus } from "./workers/expireBillingPlans.js";
import { getTodayScheduleRunCounts } from "./services/scheduleRunService.js";
import { startSelfPing, stopSelfPing } from "./workers/selfPing.js";


dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_STARTED_AT = new Date();

const isProduction =
  process.env.NODE_ENV === "production" || Boolean(process.env.RENDER);

/* Any localhost / 127.0.0.1 port is allowed outside production, so Live Server,
   Vite, or a manual `python -m http.server` on any port can reach the API. */
const LOCAL_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const allowedOrigins = new Set([
  "https://bzade.app",
  "https://www.bzade.app",
  ...(isProduction
    ? []
    : [
        "http://localhost:8158",
        "http://127.0.0.1:8158",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:5501",
        "http://127.0.0.1:5501",
      ]),
]);

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.has(origin) ||
        (!isProduction && LOCAL_ORIGIN_PATTERN.test(origin))
      ) {
        return callback(null, true);
      }
      return callback(null, false);
    },

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Authorization",
      "Content-Type",
    ],
  })
);

// app.use(express.json());
app.set("trust proxy", 2);
app.use(helmet());
app.use("/api", rateLimit({ windowMs: 60_000, limit: 120 }));
app.use(express.json({ limit: "512kb" }));

app.get('/', async (req, res) => {
  try {
    const uptimeSeconds = Math.floor(process.uptime());
    const [scheduleRunsToday] = await Promise.all([getTodayScheduleRunCounts()]);
    const health = {
      status: "ok",
      service: "Bzade backend",
      server: {
        started_at: SERVER_STARTED_AT.toISOString(),
        uptime_seconds: uptimeSeconds,
      },
      scheduler: {
        enabled: process.env.ENABLE_SCHEDULER === "true",
        ...getPlannerStatus(),
      },
      billing: getBillingExpiryStatus(),
      schedule_runs_today: scheduleRunsToday,
    };
    return res.type("application/json").send(JSON.stringify(health, null, 2));
  } catch (error) {
    console.error("[HEALTH] Could not build server health details:", error.message);
    return res.status(503).type("application/json").send(JSON.stringify({
      status: "degraded",
      service: "Bzade backend",
      error: "Could not load live schedule run counts.",
    }, null, 2));
  }
});

app.use("/api/auth", authRoute);
app.use("/api/account", accountRoute);
app.use('/api/schedules', scheduleRoute);
app.use('/api/projects', projectRoute);
app.use('/api/email-connections', emailConnectionRoute);
app.use('/api/google-sheets', googleSheetsRoute);

app.use((err, req, res, next) => {
  console.error("[UNHANDLED]", err);
  res.status(500).json({ success: false, code: "SERVER_ERROR", message: "Something went wrong. Please try again." });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Start the email scheduler only when explicitly enabled.
  // Set ENABLE_SCHEDULER=true on Render for the worker service.
  // Do not enable on the API-only instance.
  if (process.env.ENABLE_SCHEDULER === "true") {
    startScheduler().catch((error) =>
      console.error("[SCHEDULER] startup failed:", error.message),
    );
  }
  if (process.env.RENDER || process.env.ENABLE_SELF_PING === "true") {
    startSelfPing();
  }
});

server.on("close", stopSelfPing);
process.once("SIGTERM", stopSelfPing);
