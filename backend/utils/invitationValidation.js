const EMAIL =
  /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const ALLOWED_ROLES = new Set(["owner", "admin", "editor", "viewer"]);
const ALLOWED_SCOPES = new Set(["account", "project"]);
export const MAX_INVITATION_RECIPIENTS = 10;

export class InvitationValidationError extends Error {
  constructor(fieldErrors) {
    super("Check the invitation details and try again.");
    this.name = "InvitationValidationError";
    this.status = 400;
    this.code = "VALIDATION_FAILED";
    this.fieldErrors = fieldErrors;
  }
}

function isValidEmail(value) {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    EMAIL.test(value) &&
    value.split(".").pop().length >= 2
  );
}

export function normalizeInvitationInput(input, inviterEmail = "") {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new InvitationValidationError({ _form: "Invalid invitation payload." });
  }

  const fieldErrors = {};
  const emails = [];
  const seenEmails = new Set();
  if (!Array.isArray(input.emails) || input.emails.length === 0) {
    fieldErrors.emails = "Enter at least one recipient email.";
  } else if (input.emails.length > MAX_INVITATION_RECIPIENTS) {
    fieldErrors.emails = `Invite no more than ${MAX_INVITATION_RECIPIENTS} people at a time.`;
  } else {
    for (const rawEmail of input.emails) {
      if (typeof rawEmail !== "string" || !isValidEmail(rawEmail.trim())) {
        fieldErrors.emails = "Enter valid email addresses.";
        continue;
      }

      const email = rawEmail.trim().toLowerCase();
      if (email === String(inviterEmail || "").trim().toLowerCase()) {
        fieldErrors.emails = "You cannot invite your own email address.";
      } else if (seenEmails.has(email)) {
        fieldErrors.emails = "Remove duplicate email addresses.";
      } else {
        seenEmails.add(email);
        emails.push(email);
      }
    }
  }

  if (typeof input.role !== "string" || !ALLOWED_ROLES.has(input.role)) {
    fieldErrors.role = "Choose a valid invitation role.";
  }

  const scope = input.scope;
  if (typeof scope !== "string" || !ALLOWED_SCOPES.has(scope)) {
    fieldErrors.scope = "Choose an account or project scope.";
  }

  let projectId = null;
  if (scope === "project") {
    if (typeof input.project_id !== "string" || !UUID_PATTERN.test(input.project_id)) {
      fieldErrors.project_id = "Choose a valid project.";
    } else {
      projectId = input.project_id;
    }
  } else if (
    scope === "account" &&
    input.project_id !== undefined &&
    input.project_id !== null &&
    input.project_id !== ""
  ) {
    fieldErrors.project_id = "Account invitations must not include a project.";
  }

  let personalNote = null;
  if (input.personal_note !== undefined && input.personal_note !== null) {
    if (typeof input.personal_note !== "string") {
      fieldErrors.personal_note = "The personal note must be plain text.";
    } else {
      const note = input.personal_note.trim();
      if (Array.from(note).length > 500) {
        fieldErrors.personal_note = "The personal note must be 500 characters or fewer.";
      } else if (CONTROL_CHARS.test(note)) {
        fieldErrors.personal_note = "Remove unsupported control characters from the personal note.";
      } else {
        personalNote = note || null;
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new InvitationValidationError(fieldErrors);
  }

  return {
    emails,
    role: input.role,
    scope,
    project_id: projectId,
    personal_note: personalNote,
  };
}
