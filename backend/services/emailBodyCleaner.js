import sanitizeHtml from "sanitize-html";

/*
 * Cleans the HTML that the email editor produces, before it is stored or sent.
 * Only the tags and attributes listed here survive. Everything else is removed:
 * script, iframe, form, event attributes such as onclick, and javascript: links.
 */

/* A CSS value is allowed only if it has no url( and no expression. Both can load or run outside code. */
const SAFE_STYLE_VALUE = /^(?!.*url\()(?!.*expression)[#a-z0-9 ,.%()\-]+$/i;

const SAFE_STYLES = {
  color: [SAFE_STYLE_VALUE],
  "background-color": [SAFE_STYLE_VALUE],
  "font-size": [SAFE_STYLE_VALUE],
  "font-weight": [SAFE_STYLE_VALUE],
  "font-family": [SAFE_STYLE_VALUE],
  "text-align": [SAFE_STYLE_VALUE],
  "text-decoration": [SAFE_STYLE_VALUE],
  "line-height": [SAFE_STYLE_VALUE],
  padding: [SAFE_STYLE_VALUE],
  margin: [SAFE_STYLE_VALUE],
  width: [SAFE_STYLE_VALUE],
  height: [SAFE_STYLE_VALUE],
  border: [SAFE_STYLE_VALUE],
  "border-radius": [SAFE_STYLE_VALUE],
  display: [SAFE_STYLE_VALUE],
  "flex-direction": [SAFE_STYLE_VALUE],
  "justify-content": [SAFE_STYLE_VALUE],
  "align-items": [SAFE_STYLE_VALUE],
  gap: [SAFE_STYLE_VALUE],
  "max-width": [SAFE_STYLE_VALUE],
};

const OPTIONS = {
  allowedTags: [
    "html", "body", "div", "span", "p", "br", "hr", "center",
    "h1", "h2", "h3", "h4", "strong", "b", "em", "i", "u",
    "ul", "ol", "li", "a", "img",
    "table", "thead", "tbody", "tr", "td", "th",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel", "style"],
    img: ["src", "alt", "width", "height", "style"],
    "*": ["style", "align", "valign", "width", "height", "bgcolor", "border", "cellpadding", "cellspacing"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {},
  allowProtocolRelative: false,
  allowedStyles: { "*": SAFE_STYLES },
  nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "object", "embed"],
  transformTags: {
    /* Every link opens in a new tab and does not pass the referrer or window handle on. */
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" },
    }),
  },
};

export function cleanEmailHtml(raw) {
  return sanitizeHtml(String(raw ?? ""), OPTIONS).trim();
}

/* Plain text bodies: remove NUL bytes and outer spaces. */
export function cleanPlainText(raw) {
  return String(raw ?? "").replace(/\u0000/g, "").trim();
}