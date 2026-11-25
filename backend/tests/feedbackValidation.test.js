import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FeedbackValidationError,
  normalizeFeedbackSubmission,
} from "../utils/feedbackValidation.js";

test("valid feedback preserves the entered message and strips URL query data", () => {
  const message = "  Please add a weekly summary.  ";
  const result = normalizeFeedbackSubmission({
    message,
    feedback_about: "idea",
    pageurl: "https://bzade.app/schedules?project=private#details",
    status: "responded",
    is_flagged: true,
  });

  assert.equal(result.message, message);
  assert.equal(result.feedback_about, "idea");
  assert.equal(result.page_url, "https://bzade.app/schedules");
  assert.equal(result.is_flagged, false);
  assert.equal(result.flag_reason, null);
  assert.equal("status" in result, false);
});

test("authenticated feedback is associated with the verified user id", () => {
  const userId = "c246d34b-f66a-4f4f-8987-15f8b830839a";
  const result = normalizeFeedbackSubmission({
    message: "Thanks for the product.",
    feedback_about: "idea",
    pageurl: null,
    user_id: userId,
  }, userId);

  assert.equal(result.user_id, userId);
});

test("anonymous feedback omits user id and rejects a client-supplied identity", () => {
  const base = { message: "A", feedback_about: "idea", pageurl: null };
  const result = normalizeFeedbackSubmission(base);

  assert.equal("user_id" in result, false);
  assert.throws(
    () => normalizeFeedbackSubmission({ ...base, user_id: "c246d34b-f66a-4f4f-8987-15f8b830839a" }),
    FeedbackValidationError,
  );
});

test("authenticated feedback rejects a user id that does not match its bearer identity", () => {
  assert.throws(
    () => normalizeFeedbackSubmission({
      message: "A",
      feedback_about: "idea",
      pageurl: null,
      user_id: "a246d34b-f66a-4f4f-8987-15f8b830839a",
    }, "c246d34b-f66a-4f4f-8987-15f8b830839a"),
    FeedbackValidationError,
  );
});

test("message length is checked by Unicode code point", () => {
  const message = "🙂".repeat(10_000);
  const result = normalizeFeedbackSubmission({
    message,
    feedback_about: "idea",
    pageurl: null,
  });

  assert.equal(result.message, message);
});

test("potential executable content is retained but flagged for review", () => {
  const message = 'Could you review this? <script>alert("x")</script>';
  const result = normalizeFeedbackSubmission({
    message,
    feedback_about: "issue",
    pageurl: "http://localhost:5501/feedback",
  });

  assert.equal(result.message, message);
  assert.equal(result.is_flagged, true);
  assert.match(result.flag_reason, /script injection/i);
});

test("potential SQL injection content is flagged without modifying the message", () => {
  const message = "The query included UNION SELECT unexpectedly.";
  const result = normalizeFeedbackSubmission({
    message,
    feedback_about: "something_else",
    pageurl: null,
  });

  assert.equal(result.message, message);
  assert.equal(result.is_flagged, true);
  assert.match(result.flag_reason, /SQL injection/i);
});

test("SQL tautologies are flagged while the original message remains reviewable", () => {
  const message = "Input included OR 1=1";
  const result = normalizeFeedbackSubmission({
    message,
    feedback_about: "issue",
    pageurl: null,
  });

  assert.equal(result.message, message);
  assert.equal(result.is_flagged, true);
});

test("invalid feedback category, blank message, excess length, and unsafe URL fail validation", () => {
  for (const body of [
    { message: " ", feedback_about: "idea", pageurl: null },
    { message: "A", feedback_about: "other", pageurl: null },
    { message: "A".repeat(10_001), feedback_about: "issue", pageurl: null },
    { message: "A", feedback_about: "issue", pageurl: "javascript:alert(1)" },
    { message: "A\u0000B", feedback_about: "issue", pageurl: null },
    [],
  ]) {
    assert.throws(() => normalizeFeedbackSubmission(body), FeedbackValidationError);
  }
});
