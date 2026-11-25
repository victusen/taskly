import { BACKEND_URL } from "../scripts/config.js";
import { getSession } from "../scripts/auth/auth.js";

const form = document.getElementById("feedback-form");
const messageInput = document.getElementById("feedback-message");
const submitButton = document.getElementById("feedback-submit");
const statusMessage = document.getElementById("feedback-status");
let isSubmitting = false;
const MAX_FEEDBACK_LENGTH = 10_000;
const UNSUPPORTED_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const FEEDBACK_CATEGORIES = new Set(["idea", "issue", "something_else"]);

messageInput?.addEventListener("input", () => {
  const message = messageInput.value;
  const error = Array.from(message).length > MAX_FEEDBACK_LENGTH
    ? `Feedback must be no more than ${MAX_FEEDBACK_LENGTH} characters.`
    : UNSUPPORTED_CONTROL_CHARS.test(message)
      ? "Remove unsupported control characters from your feedback."
      : "";
  messageInput.setCustomValidity(error);
});

function feedbackSourceUrl() {
  const currentUrl = new URL(window.location.href);
  if (document.referrer) {
    try {
      const sourceUrl = new URL(document.referrer);
      if (sourceUrl.origin === currentUrl.origin && sourceUrl.pathname !== currentUrl.pathname) {
        return `${sourceUrl.origin}${sourceUrl.pathname}`;
      }
    } catch {
      // Fall back to the feedback page URL when the referrer is malformed.
    }
  }
  return `${currentUrl.origin}${currentUrl.pathname}`;
}

function showStatus(message, state) {
  statusMessage.textContent = message;
  statusMessage.dataset.state = state;
  statusMessage.setAttribute("role", state === "error" ? "alert" : "status");
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isSubmitting || !form.reportValidity()) return;

  const formData = new FormData(form);
  const message = String(formData.get("message") || "");
  const feedbackAbout = String(formData.get("feedback_about") || "");
  if (!FEEDBACK_CATEGORIES.has(feedbackAbout)) {
    showStatus("Choose a feedback category.", "error");
    return;
  }

  const payload = {
    message,
    feedback_about: feedbackAbout,
    pageurl: feedbackSourceUrl(),
  };

  isSubmitting = true;
  submitButton.disabled = true;
  form.setAttribute("aria-busy", "true");
  submitButton.textContent = "Sending...";
  statusMessage.textContent = "";
  delete statusMessage.dataset.state;

  try {
    const session = await getSession();
    const headers = { "Content-Type": "application/json" };
    if (session) {
      if (!session.access_token) {
        throw new Error("Could not verify your signed-in account. Please refresh and try again.");
      }
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const response = await fetch(`${BACKEND_URL}/api/feedback`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    let result = {};
    try {
      result = await response.json();
    } catch {
      result = {};
    }
    if (!response.ok) {
      throw new Error(result.message || "We could not send your feedback. Please try again.");
    }
    if (result.success !== true) {
      throw new Error("We could not confirm that your feedback was received. Please try again.");
    }

    form.reset();
    showStatus("Thank you. Your feedback has been sent.", "success");
  } catch (error) {
    showStatus(
      error instanceof TypeError
        ? "We could not reach the feedback service. Check your connection and try again."
        : error.message || "We could not send your feedback. Please try again.",
      "error",
    );
  } finally {
    isSubmitting = false;
    submitButton.disabled = false;
    submitButton.textContent = "Send Us";
    form.removeAttribute("aria-busy");
  }
});
