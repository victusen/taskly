import assert from "node:assert/strict";
import { test } from "node:test";

import { createSendRateLimiter } from "../services/sendRateLimiter.js";

test("50-per-minute limiter spaces the 51st message at the 60-second mark", async () => {
  let now = 0;
  const starts = [];
  const waitForSlot = createSendRateLimiter({
    limit: 50,
    windowMs: 60_000,
    now: () => now,
    sleep: async (delay) => {
      now += delay;
    },
  });

  for (let index = 0; index < 51; index += 1) {
    await waitForSlot("connection-1");
    starts.push(now);
  }

  assert.equal(starts[0], 0);
  assert.equal(starts[49], 58_800);
  assert.equal(starts[50], 60_000);
});
