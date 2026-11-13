import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  decryptJson,
  encryptJson,
} from "../utils/credentialCrypto.js";
import { createGoogleAuthorizationUrl } from "../services/googleOAuthService.js";

const TEST_KEY = "0123456789abcdef".repeat(4);
const TEST_ENV = [
  "BZADE_CREDENTIAL_ENCRYPTION_KEY",
  "TASKLY_CREDENTIAL_ENCRYPTION_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
];
const previousEnvironment = new Map();

beforeEach(() => {
  for (const name of TEST_ENV) previousEnvironment.set(name, process.env[name]);
  process.env.BZADE_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  process.env.TASKLY_CREDENTIAL_ENCRYPTION_KEY = "";
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.GOOGLE_REDIRECT_URI = "https://example.test/google/callback";
});

afterEach(() => {
  for (const name of TEST_ENV) {
    const previous = previousEnvironment.get(name);
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
  previousEnvironment.clear();
});

test("Google OAuth credentials round-trip through authenticated encryption", () => {
  const credentials = {
    access_token: "access-token",
    refresh_token: "refresh-token",
    expiry_date: 1_800_000_000_000,
    scope: "https://www.googleapis.com/auth/gmail.send",
    token_type: "Bearer",
  };

  assert.deepEqual(decryptJson(encryptJson(credentials)), credentials);
});

test("credential decryption rejects a modified authentication tag", () => {
  const encrypted = encryptJson({ refresh_token: "refresh-token" });
  const tag = Buffer.from(encrypted.authTag, "base64");
  tag[0] ^= 1;
  encrypted.authTag = tag.toString("base64");

  assert.throws(() => decryptJson(encrypted));
});

test("Sheets authorization requests offline access and all required scopes", () => {
  const authorizationUrl = new URL(createGoogleAuthorizationUrl("test-state", { includeSheets: true }));
  const scopes = new Set(authorizationUrl.searchParams.get("scope").split(" "));

  assert.equal(authorizationUrl.searchParams.get("access_type"), "offline");
  assert.equal(authorizationUrl.searchParams.get("prompt"), "consent");
  assert.ok(scopes.has("https://www.googleapis.com/auth/gmail.send"));
  assert.ok(scopes.has("https://www.googleapis.com/auth/spreadsheets.readonly"));
  assert.ok(scopes.has("https://www.googleapis.com/auth/drive.file"));
});
