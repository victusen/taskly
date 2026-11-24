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

test("invalid feedback category, blank message, excess length, and unsafe URL fail validation", () => {
  for (const body of [
    { message: " ", feedback_about: "idea", pageurl: null },
    { message: "A", feedback_about: "other", pageurl: null },
    { message: "A".repeat(10_001), feedback_about: "issue", pageurl: null },
    { message: "A", feedback_about: "issue", pageurl: "javascript:alert(1)" },
  ]) {
    assert.throws(() => normalizeFeedbackSubmission(body), FeedbackValidationError);
  }
});
