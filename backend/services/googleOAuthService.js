import { google } from "googleapis";

const GOOGLE_IDENTITY_SCOPES = [
  "openid",
  "email",
  "profile",
];
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function createGoogleOAuthClient() {
  return getOAuthClient();
}

export function createGoogleAuthorizationUrl(state, { purpose = "mail", includeSheets = false } = {}) {
  const client = getOAuthClient();
  const isSheetsConnection = purpose === "database" || includeSheets;
  const scopes = isSheetsConnection
    ? [...GOOGLE_IDENTITY_SCOPES, GOOGLE_SHEETS_SCOPE, GOOGLE_DRIVE_FILE_SCOPE]
    : [...GOOGLE_IDENTITY_SCOPES, GMAIL_SEND_SCOPE];

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: isSheetsConnection ? "select_account consent" : "consent",
    include_granted_scopes: !isSheetsConnection,
    scope: scopes,
    state,
  });
}

export async function exchangeGoogleCode(code) {
  const client = getOAuthClient();

  const { tokens } =
    await client.getToken(code);

  if (!tokens.access_token) {
    throw new Error(
      "Google did not return an access token."
    );
  }

  return {
    client,
    tokens,
  };
}

export async function getGoogleAccount(client) {
  const oauth2 = google.oauth2({
    auth: client,
    version: "v2",
  });

  const { data } =
    await oauth2.userinfo.get();

  if (!data.email) {
    throw new Error(
      "Google account email was not returned."
    );
  }

  if (data.verified_email === false) {
    throw new Error(
      "Google account email is not verified."
    );
  }

  return {
    id: data.id || null,
    email: data.email,
    name: data.name || null,
    picture: data.picture || null,
  };
}