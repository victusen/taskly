import { BACKEND_URL } from "../scripts/config.js";

const form = document.getElementById("feedback-form");
const messageInput = document.getElementById("feedback-message");
const submitButton = document.getElementById("feedback-submit");
const statusMessage = document.getElementById("feedback-status");
let isSubmitting = false;

messageInput?.addEventListener("input", () => {
  const isTooLong = Array.from(messageInput.value).length > 10_000;
  messageInput.setCustomValidity(isTooLong ? "Feedback must be no more than 10,000 characters." : "");
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
  const payload = {
    message: String(formData.get("message") || ""),
    feedback_about: String(formData.get("feedback_about") || ""),
    pageurl: feedbackSourceUrl(),
  };

  isSubmitting = true;
  submitButton.disabled = true;
  form.setAttribute("aria-busy", "true");
  submitButton.textContent = "Sending...";
  statusMessage.textContent = "";
  delete statusMessage.dataset.state;

  try {
    const response = await fetch(`${BACKEND_URL}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
