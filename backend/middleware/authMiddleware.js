import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { supabase } from '../config/supabase.js';

app.use(helmet());
app.use("/api", rateLimit({ windowMs: 60_000, limit: 120 }));

export async function authMiddleware(req, res, next) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization) {
      return res.status(401).json({ success: false, code: "UNAUTHORIZED", message: "Please sign in again." });
    }

    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ success: false, code: "UNAUTHORIZED", message: "Please sign in again." });
    }

    const {
      data: { user },
      error
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ success: false, code: "UNAUTHORIZED", message: "Please sign in again." });
    }

    req.user = user;

    next();

  } catch (error) {
    console.error('Authentication error:', error);

    return res.status(401).json({ success: false, code: "UNAUTHORIZED", message: "Please sign in again." });
  }
}