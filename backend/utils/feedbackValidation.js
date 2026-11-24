const FEEDBACK_CATEGORIES = new Set(["idea", "issue", "something_else"]);
const MAX_FEEDBACK_LENGTH = 10_000;
const MAX_PAGE_URL_LENGTH = 2_048;

const FLAG_RULES = [
  {
    reason: "Potential executable HTML or script injection content.",
    pattern: /<\s*(?:script|iframe|object|embed|svg|math)\b|\bon[a-z]{2,}\s*=\s*(?:"|'|`|[^\s>]+)|\b(?:javascript|vbscript)\s*:/i,
  },
  {
    reason: "Potential SQL injection pattern.",
    pattern: /\bunion\s+(?:all\s+)?select\b|;\s*(?:drop|alter|truncate|delete|update|insert)\b|(?:'|")\s*(?:or|and)\s+[\w'"]+\s*=\s*[\w'"]+/i,
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

export function normalizeFeedbackSubmission(body) {
  const fieldErrors = {};
  const message = typeof body?.message === "string" ? body.message : "";
  const messageLength = Array.from(message).length;
  const feedbackAbout = body?.feedback_about;
  const pageUrl = normalizePageUrl(body?.pageurl);

  if (!message.trim()) fieldErrors.message = "Enter a feedback message.";
  if (messageLength > MAX_FEEDBACK_LENGTH) {
    fieldErrors.message = `Feedback must be no more than ${MAX_FEEDBACK_LENGTH} characters.`;
  }
  if (typeof feedbackAbout !== "string" || !FEEDBACK_CATEGORIES.has(feedbackAbout)) {
    fieldErrors.feedback_about = "Choose a feedback category.";
  }
  if (pageUrl === undefined) fieldErrors.pageurl = "The page URL is not valid.";
  if (Object.keys(fieldErrors).length > 0) throw new FeedbackValidationError(fieldErrors);

  const flagReasons = FLAG_RULES
    .filter(({ pattern }) => pattern.test(message))
    .map(({ reason }) => reason);

  return {
    message,
    feedback_about: feedbackAbout,
    page_url: pageUrl,
    is_flagged: flagReasons.length > 0,
    flag_reason: flagReasons.length > 0 ? flagReasons.join(" ") : null,
  };
}
