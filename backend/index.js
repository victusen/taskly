import express from 'express';
import cors from "cors";
import dotenv from 'dotenv';
import authRoute from './routes/authRoute.js';
import paymentRoute from './routes/paymentRoute.js';
import scheduleRoute from './routes/scheduleRoute.js';
import emailConnectionRoute from './routes/emailConnectionRoute.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = new Set([
  "http://localhost:8158",
  "http://127.0.0.1:8158",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https:bzade.app"
]);

app.use(
  cors({
    origin(origin, callback) {
      // Allows tools such as curl/Postman with no Origin header.
      if (!origin) {
        return callback(null, true);
        console.log("CORS origin not allowed")
      }

      if (allowedOrigins.has(origin)) {
        return callback(null, true);
        console.log("CORS origin not allowed")
      }

      return callback(
        new Error("CORS origin not allowed")
      );
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

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Bzade backend is running!');
});

app.use('/api/auth', authRoute);
app.use('/api/payment', paymentRoute);
app.use('/api/schedules', scheduleRoute);
app.use('/api/email-connections', emailConnectionRoute);

app.listen(PORT, () => {
  console.log(`Server is listening on http://localhost:${PORT}`);
});
