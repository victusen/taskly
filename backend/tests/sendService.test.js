import assert from "node:assert/strict";
import { test } from "node:test";

import { buildRawMessage, createRecipientMessages } from "../services/sendService.js";

test("manual schedule recipients become individual messages with repeated copy recipients", () => {
  const messages = createRecipientMessages({
    recipients: ["ada@example.com", "grace@example.com"],
    cc: ["team@example.com"],
    bcc: ["archive@example.com"],
    subject: "Hello",
    body: "Welcome",
    body_type: "text",
  });

  assert.deepEqual(messages.map((message) => message.recipients), [
    ["ada@example.com"],
    ["grace@example.com"],
  ]);
  assert.deepEqual(messages[0].cc, ["team@example.com"]);
  assert.deepEqual(messages[1].bcc, ["archive@example.com"]);
});

test("Gmail raw messages contain From and To plus only populated Cc and Bcc headers", () => {
  const raw = buildRawMessage({
    from: "sender@example.com",
    recipients: ["customer@example.com"],
    cc: ["team@example.com"],
    subject: "Hello",
    body: "Welcome",
    bodyType: "text",
  });
  const message = Buffer.from(raw, "base64url").toString("utf8");

  assert.match(message, /^From: sender@example\.com\r\n/m);
  assert.match(message, /^To: customer@example\.com\r\n/m);
  assert.match(message, /^Cc: team@example\.com\r\n/m);
  assert.doesNotMatch(message, /^Bcc:/m);

  const withBcc = buildRawMessage({
    from: "sender@example.com",
    recipients: ["customer@example.com"],
    bcc: ["archive@example.com"],
    subject: "Hello",
    body: "Welcome",
    bodyType: "text",
  });
  assert.match(Buffer.from(withBcc, "base64url").toString("utf8"), /^Bcc: archive@example\.com\r\n/m);
});
