import express from 'express';
import cors from "cors";
import dotenv from 'dotenv';
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import accountRoute from "./routes/accountRoute.js";
import scheduleRoute from './routes/scheduleRoute.js';
import projectRoute from "./routes/projectRoute.js";
import emailConnectionRoute from './routes/emailConnectionRoute.js';


dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const isProduction =
  process.env.NODE_ENV === "production" || Boolean(process.env.RENDER);

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
      ]),
]);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
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

app.use("/api/account", accountRoute);
app.use('/api/schedules', scheduleRoute);
app.use('/api/projects', projectRoute);
app.use('/api/email-connections', emailConnectionRoute);

app.use((err, req, res, next) => {
  console.error("[UNHANDLED]", err);
  res.status(500).json({ success: false, code: "SERVER_ERROR", message: "Something went wrong. Please try again." });
});

app.listen(PORT, () => {
  console.log(`Server is listening on http://localhost:${PORT}`);
});


