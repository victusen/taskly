const FEEDBACK_CATEGORIES = new Set(["idea", "issue", "something_else"]);
const MAX_FEEDBACK_LENGTH = 10_000;
const MAX_PAGE_URL_LENGTH = 2_048;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNSUPPORTED_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const FLAG_RULES = [
  {
    reason: "Potential executable HTML or script injection content.",
    pattern: /<\s*(?:script|iframe|object|embed|svg|math)\b|\bon[a-z]{2,}\s*=\s*(?:"|'|`|[^\s>]+)|\b(?:javascript|vbscript)\s*:/i,
  },
  {
    reason: "Potential SQL injection pattern.",
    pattern: /\bunion\s+(?:all\s+)?select\b|;\s*(?:drop|alter|truncate|delete|update|insert)\b|\b(?:drop|alter|truncate|delete|insert)\s+(?:table|database|into)\b|(?:'|")?\s*(?:or|and)\s+(?:'|")?\w+(?:'|")?\s*=\s*(?:'|")?\w+(?:'|")?/i,
  },
];

export class FeedbackValidationError extends Error {
  constructor(fieldErrors) {
    super("Check the feedback details and try again.");
    this.name = "FeedbackValidationError";
    this.fieldErrors = fieldErrors;
  }
}

function normalizePageUrl(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > MAX_PAGE_URL_LENGTH) return undefined;

  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return undefined;
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

export function normalizeFeedbackSubmission(body, authenticatedUserId = null) {
  const fieldErrors = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new FeedbackValidationError({ _form: "Invalid feedback submission." });
  }

  const message = typeof body?.message === "string" ? body.message : "";
  const messageLength = Array.from(message).length;
  const feedbackAbout = body?.feedback_about;
  const pageUrl = normalizePageUrl(body?.pageurl);
  const suppliedUserId = body.user_id;

  if (!message.trim()) fieldErrors.message = "Enter a feedback message.";
  if (messageLength > MAX_FEEDBACK_LENGTH) {
    fieldErrors.message = `Feedback must be no more than ${MAX_FEEDBACK_LENGTH} characters.`;
  }
  if (UNSUPPORTED_CONTROL_CHARS.test(message)) {
    fieldErrors.message = "Remove unsupported control characters from the feedback.";
  }
  if (typeof feedbackAbout !== "string" || !FEEDBACK_CATEGORIES.has(feedbackAbout)) {
    fieldErrors.feedback_about = "Choose a feedback category.";
  }
  if (pageUrl === undefined) fieldErrors.pageurl = "The page URL is not valid.";
  if (
    authenticatedUserId !== null &&
    (typeof authenticatedUserId !== "string" || !UUID_PATTERN.test(authenticatedUserId))
  ) {
    fieldErrors.user_id = "The signed-in account could not be verified.";
  } else if (
    suppliedUserId !== undefined &&
    suppliedUserId !== null &&
    suppliedUserId !== "" &&
    (!authenticatedUserId || suppliedUserId !== authenticatedUserId)
  ) {
    fieldErrors.user_id = "The user id does not match the signed-in account.";
  }
  if (Object.keys(fieldErrors).length > 0) throw new FeedbackValidationError(fieldErrors);

  const flagReasons = FLAG_RULES
    .filter(({ pattern }) => pattern.test(message))
    .map(({ reason }) => reason);

  const feedback = {
    message,
    feedback_about: feedbackAbout,
    page_url: pageUrl,
    is_flagged: flagReasons.length > 0,
    flag_reason: flagReasons.length > 0 ? flagReasons.join(" ") : null,
  };

  if (authenticatedUserId) feedback.user_id = authenticatedUserId;
  return feedback;
}
