import assert from "node:assert/strict";
import { test } from "node:test";

process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY ||= "test-service-role-key";

const { dispatchRecipientSource } = await import("../services/recipientSourceDispatcher.js");

test("manual schedules use the manual recipient handler", async () => {
  const recipients = ["ada@example.com", "grace@example.com"];
  const prepared = await dispatchRecipientSource({
    config: { recipient_source: { type: "manual" }, recipients },
  });

  assert.equal(prepared.type, "manual");
  assert.equal(prepared.recipientCount, 2);
  assert.deepEqual(prepared.recipients, recipients);
});

test("unknown database providers fail explicitly", async () => {
  await assert.rejects(
    dispatchRecipientSource({
      config: { recipient_source: { type: "database", provider: "unknown" } },
    }),
    (error) => error.code === "UNSUPPORTED_RECIPIENT_SOURCE" && error.permanent,
  );
});
