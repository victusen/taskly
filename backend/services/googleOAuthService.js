import { google } from "googleapis";

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
];

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function createGoogleAuthorizationUrl(state) {
  const client = getOAuthClient();

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: GOOGLE_SCOPES,
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
    email: data.email,
    name: data.name || null,
    picture: data.picture || null,
  };
}