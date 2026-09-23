import { paymentService } from '../services/paymentService.js';

export const paymentController = {
  async initiate(req, res) {
    try {
      const { userId, amount } = req.body;
      if (!userId || !amount) {
        return res.status(400).json({ error: 'userId and amount are required' });
      }
      const result = await paymentService.initiatePayment(userId, amount);
      return res.status(200).json(result);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  },

  async webhook(req, res) {
    try {
      const signature = req.headers['x-paystack-signature'] || req.headers['stripe-signature'];
      const result = await paymentService.handleWebhook(req.body, signature);
      return res.status(200).json(result);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
};
