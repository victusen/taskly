import { authService } from '../services/authService.js';

export const authController = {
  async register(req, res) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }
      const data = await authService.register(email, password);
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },

  async login(req, res) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }
      const data = await authService.login(email, password);
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },

  async logout(req, res) {
    try {
      const data = await authService.logout();
      return res.status(200).json({ success: true, message: data.message });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  },

  async me(req, res) {
    return res.status(200).json({
      success: true,
      user: req.user
    });
  }
};
