import express from 'express';
import dotenv from 'dotenv';
import authRoute from './routes/authRoute.js';
import paymentRoute from './routes/paymentRoute.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Taskly Backend is running!');
});

app.use('/api/auth', authRoute);
app.use('/api/payment', paymentRoute);


app.listen(PORT, () => {
  console.log(`Server is listening on http://localhost:${PORT}`);
});
