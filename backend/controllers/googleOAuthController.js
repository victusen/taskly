import crypto from "node:crypto";

import { supabase } from "../config/supabase.js";

import {
  createGoogleAuthorizationUrl,
  exchangeGoogleCode,
  getGoogleAccount,
} from "../services/googleOAuthService.js";

import {
  createGoogleConnection,
  assertProjectCanConnect,
  assertOwnedProject,
} from "../services/emailConnectionService.js";
import { assertProjectAccess } from "../services/projectAccessService.js";
import { upsertGoogleSheetsDatabase } from "../services/scheduleDatabaseService.js";

import {
  hashState,
} from "../utils/credentialCrypto.js";

const STATE_EXPIRY_MINUTES = 10;

const FRONTEND_URL = (process.env.FRONTEND_URL || "https://bzade.app").replace(/\/+$/, "");
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const projectBack = (result, projectId, connectionId = null) => {
  const params = new URLSearchParams({ project: projectId, google: result });
  if (connectionId) params.set("google_connection_id", connectionId);
  return `${FRONTEND_URL}/schedules.html?${params}`;
};

export async function startGoogleOAuth(
  req,
  res,
  purposeOverride = null,
) {
  try {
    const userId = req.user.id;
    const purpose = purposeOverride || (req.query.purpose === "database" ? "database" : "mail");
    const projectId = req.query.project_id;
    if (typeof projectId !== "string") {
      return res.status(400).json({
        success: false,
        message: "A valid project is required to connect Google.",
      });
    }
    if (purpose === "database") {
      await assertProjectAccess(userId, projectId, { allowedStatuses: ["active", "paused"] });
    } else {
      await assertProjectCanConnect(userId, projectId);
    }

    const nonce = crypto.randomBytes(32).toString("hex");
    const state = `${nonce}.project.${projectId}${purpose === "database" ? ".database" : ""}`;

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

    const authorizationUrl = createGoogleAuthorizationUrl(state, { purpose });

    return res.status(200).json({
      success: true,
      authorizationUrl,
    });

  } catch (error) {
    if (error?.status && error?.code) {
      return res.status(error.status).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }
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

export function startGoogleSheetsOAuth(req, res) {
  return startGoogleOAuth(req, res, "database");
}

export async function googleOAuthCallback(req, res) {
  let databaseProjectId = null;
  const projectIdFromState = { value: null };
  const resultUrl = (result) =>
    projectIdFromState.value
      ? projectBack(result, projectIdFromState.value)
      : `${FRONTEND_URL}/dashboard.html?google=${result}`;

  try {
    const { code, state, error: oauthError } = req.query;

    const stateMatch = typeof state === "string"
      ? state.match(/^([a-f0-9]{64})\.project\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\.database)?$/i)
      : null;
    if (!stateMatch) {
      return res.status(400).send("Invalid OAuth state.");
    }
    projectIdFromState.value = stateMatch[2];
    databaseProjectId = stateMatch[3] ? stateMatch[2] : null;

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

    if (databaseProjectId) {
      await assertProjectAccess(oauthState.user_id, projectIdFromState.value, {
        allowedStatuses: ["active", "paused"],
      });
    } else {
      await assertOwnedProject(oauthState.user_id, projectIdFromState.value);
    }

    if (oauthError) {
      return res.redirect(resultUrl(databaseProjectId ? "database_cancelled" : "cancelled"));
    }

    if (typeof code !== "string" || !code) {
      return res.redirect(resultUrl(databaseProjectId ? "database_failed" : "failed"));
    }

    const { client, tokens } = await exchangeGoogleCode(code);

    if (
      databaseProjectId &&
      !String(tokens.scope || "").split(" ").includes(GOOGLE_SHEETS_SCOPE)
    ) {
      return res.redirect(resultUrl("missing_sheets_scope"));
    }
    if (
      databaseProjectId &&
      !String(tokens.scope || "").split(" ").includes(GOOGLE_DRIVE_FILE_SCOPE)
    ) {
      return res.redirect(resultUrl("missing_drive_scope"));
    }
    if (!databaseProjectId && !String(tokens.scope || "").split(" ").includes("https://www.googleapis.com/auth/gmail.send")) {
      return res.redirect(resultUrl("missing_scope"));
    }

    client.setCredentials(tokens);
    const account = await getGoogleAccount(client);

    let connection;
    if (databaseProjectId) {
      connection = await upsertGoogleSheetsDatabase({
        userId: oauthState.user_id,
        projectId: projectIdFromState.value,
        account,
        tokens,
      });
    } else {
      await assertProjectCanConnect(oauthState.user_id, projectIdFromState.value);
      connection = await createGoogleConnection({
        projectId: projectIdFromState.value,
        email: account.email,
        tokens,
      });
    }

    console.log("[GOOGLE OAUTH] Connected", {
      userId: oauthState.user_id,
      connectionId: connection.id,
    });

    return res.redirect(databaseProjectId
      ? projectBack("database_connected", projectIdFromState.value, connection.id)
      : resultUrl("connected"));
  } catch (error) {
    console.error("[GOOGLE OAUTH CALLBACK]", error);
    return res.redirect(resultUrl(databaseProjectId ? "database_failed" : "failed"));
  }
}