import crypto from "node:crypto";

import { supabase } from "../config/supabase.js";

import {
  createGoogleAuthorizationUrl,
  exchangeGoogleCode,
  getGoogleAccount,
} from "../services/googleOAuthService.js";

import {
  createGoogleConnection,
} from "../services/emailConnectionService.js";

import {
  hashState,
} from "../utils/credentialCrypto.js";

const STATE_EXPIRY_MINUTES = 10;

const FRONTEND_URL = (process.env.FRONTEND_URL || "https://bzade.app").replace(/\/+$/, "");
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const back = (result) => `${FRONTEND_URL}/dashboard.html?google=${result}`;
const databaseBack = (result, projectId) =>
  `${FRONTEND_URL}/schedules.html?project=${encodeURIComponent(projectId)}&google=${result}`;

export async function startGoogleOAuth(
  req,
  res
) {
  try {
    const userId = req.user.id;
    const purpose = req.query.purpose === "database" ? "database" : "mail";
    const projectId = req.query.project_id;
    if (
      purpose === "database" &&
      (typeof projectId !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(projectId))
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid project is required to connect a database.",
      });
    }

    const nonce = crypto.randomBytes(32).toString("hex");
    const state = purpose === "database" ? `${nonce}.database.${projectId}` : nonce;

    const stateHash =
      hashState(state);

    const expiresAt =
      new Date(
        Date.now() +
        STATE_EXPIRY_MINUTES * 60 * 1000
      ).toISOString();

    const { error } =
      await supabase
        .from("oauth_states")
        .insert({
          user_id: userId,
          provider: "google",
          state_hash: stateHash,
          expires_at: expiresAt,
        });

    if (error) {
      throw error;
    }

    const authorizationUrl =
      createGoogleAuthorizationUrl(state, { includeSheets: purpose === "database" });

    return res.status(200).json({
      success: true,
      authorizationUrl,
    });

  } catch (error) {
    console.error(
      "[GOOGLE OAUTH START]",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to start Google connection.",
    });
  }
}

export async function googleOAuthCallback(req, res) {
  let databaseProjectId = null;
  const resultUrl = (result) =>
    databaseProjectId ? databaseBack(result, databaseProjectId) : back(result);

  try {
    const { code, state, error: oauthError } = req.query;

    const stateMatch = typeof state === "string"
      ? state.match(/^([a-f0-9]{64})(?:\.database\.([A-Za-z0-9-]{1,64}))?$/)
      : null;
    if (!stateMatch) {
      return res.status(400).send("Invalid OAuth state.");
    }
    databaseProjectId = stateMatch[2] || null;

    // Finds the state and marks it used in one statement, so it works only once.
    const now = new Date().toISOString();

    const { data: oauthState, error } = await supabase
      .from("oauth_states")
      .update({ consumed_at: now })
      .eq("state_hash", hashState(state))
      .eq("provider", "google")
      .is("consumed_at", null)
      .gt("expires_at", now)
      .select("id, user_id")
      .maybeSingle();

    if (error || !oauthState) {
      return res.status(400).send("Invalid, used or expired OAuth request.");
    }

    if (oauthError) {
      return res.redirect(resultUrl(databaseProjectId ? "database_cancelled" : "cancelled"));
    }

    if (typeof code !== "string" || !code) {
      return res.redirect(resultUrl(databaseProjectId ? "database_failed" : "failed"));
    }

    const { client, tokens } = await exchangeGoogleCode(code);

    // Google lets users untick permissions. Without this one, sending never works.
    if (!String(tokens.scope || "").split(" ").includes(GMAIL_SEND_SCOPE)) {
      return res.redirect(resultUrl(databaseProjectId ? "database_missing_scope" : "missing_scope"));
    }
    if (
      databaseProjectId &&
      !String(tokens.scope || "").split(" ").includes(GOOGLE_SHEETS_SCOPE)
    ) {
      return res.redirect(resultUrl("missing_sheets_scope"));
    }

    client.setCredentials(tokens);
    const account = await getGoogleAccount(client);

    const connection = await createGoogleConnection({
      userId: oauthState.user_id,
      email: account.email,
      tokens,
    });

    console.log("[GOOGLE OAUTH] Connected", {
      userId: oauthState.user_id,
      connectionId: connection.id,
    });

    return res.redirect(resultUrl(databaseProjectId ? "database_connected" : "connected"));
  } catch (error) {
    console.error("[GOOGLE OAUTH CALLBACK]", error);
    return res.redirect(resultUrl(databaseProjectId ? "database_failed" : "failed"));
  }
}