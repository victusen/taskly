export function createSendRateLimiter({
  limit,
  windowMs,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (!Number.isFinite(limit) || limit < 1 || !Number.isFinite(windowMs) || windowMs < 1) {
    throw new Error("A positive send limit and time window are required.");
  }

  const intervalMs = windowMs / limit;
  const nextAllowedAt = new Map();

  return async function waitForSendSlot(key) {
    const currentTime = now();
    const scheduledAt = Math.max(currentTime, nextAllowedAt.get(key) || 0);
    nextAllowedAt.set(key, scheduledAt + intervalMs);
    const delay = scheduledAt - currentTime;
    if (delay > 0) await sleep(delay);
  };
}

export const waitForSpreadsheetSendSlot = createSendRateLimiter({
  limit: 50,
  windowMs: 60_000,
});
