const MIN_PING_DELAY_MS = 6 * 60 * 1000;
const MAX_PING_DELAY_MS = 11 * 60 * 1000;
const PING_TIMEOUT_MS = 15 * 1000;

let pingTimer = null;
let pingInProgress = false;

function nextDelayMs() {
  return Math.floor(
    MIN_PING_DELAY_MS + Math.random() * (MAX_PING_DELAY_MS - MIN_PING_DELAY_MS),
  );
}

export function startSelfPing({
  url = process.env.SELF_PING_URL || process.env.RENDER_EXTERNAL_URL || "https://api.bzade.app",
  serverName = process.env.SELF_PING_NAME || "Server1",
} = {}) {
  if (pingTimer || pingInProgress) return stopSelfPing;

  const scheduleNextPing = (delay) => {
    pingTimer = setTimeout(ping, delay);
    pingTimer.unref?.();
    console.log(`pinging in: ${(delay / 60_000).toFixed(2)} mins`);
  };

  const ping = async () => {
    pingTimer = null;
    if (pingInProgress) return scheduleNextPing(nextDelayMs());
    pingInProgress = true;
    console.log("Pinging server");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
    timeout.unref?.();

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.ok) {
        console.log(`${serverName} pinged. Status is ${response.status}`);
      } else {
        console.warn(`${serverName} responded with ${response.status}`);
      }
    } catch (error) {
      console.warn(`[PING] ${serverName} ping failed: ${error.message}`);
    } finally {
      clearTimeout(timeout);
      pingInProgress = false;
      scheduleNextPing(nextDelayMs());
    }
  };

  void ping();
  return stopSelfPing;
}

export function stopSelfPing() {
  if (pingTimer) clearTimeout(pingTimer);
  pingTimer = null;
}
