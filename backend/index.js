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


dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

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

app.get('/', (req, res) => {
  res.send('Bzade backend is running!');
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Start the email scheduler only when explicitly enabled.
  // Set ENABLE_SCHEDULER=true on Render for the worker service.
  // Do not enable on the API-only instance.
  if (process.env.ENABLE_SCHEDULER === "true") {
    startScheduler();
  }
});

function generateNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

async function pingAlways() {
  const randomDelay = generateNumber(360000, 660000);

  try {
    console.log("Pinging server");
    const res = await fetch('https://api.bzade.app');

    if (res.ok) {
      console.log("Server1 pinged. Status is", res.status);
    } else {
      console.log(`Server1 responded with ${res.status}`);
    }
  } catch (err) {
    console.log("A server is down\n", err.message, "\n");
  }

  console.log("pinging in: " + randomDelay / (1000 * 60) + " mins");
  setTimeout(() => pingAlways(), randomDelay);
}

pingAlways();
