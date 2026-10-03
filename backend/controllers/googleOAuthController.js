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

export async function startGoogleOAuth(
  req,
  res
) {
  try {
    const userId = req.user.id;

    const state =
      crypto.randomBytes(32).toString("hex");

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
      createGoogleAuthorizationUrl(state);

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

export async function googleOAuthCallback(
  req,
  res
) {
  try {
    const {
      code,
      state,
      error: oauthError,
    } = req.query;

    if (!state) {
      return res.status(400).send(
        "Invalid OAuth state."
      );
    }

    const stateHash = hashState(state);

    const { data: oauthState, error } =
      await supabase
        .from("oauth_states")
        .select(
          "id, user_id, provider, expires_at, consumed_at"
        )
        .eq("state_hash", stateHash)
        .eq("provider", "google")
        .is("consumed_at", null)
        .single();

    if (error || !oauthState) {
      console.error(
        "[GOOGLE OAUTH CALLBACK] Invalid state",
        error
      );

      return res.status(400).send(
        "Invalid or expired OAuth request."
      );
    }

    if (
      new Date(oauthState.expires_at) <
      new Date()
    ) {
      return res.status(400).send(
        "OAuth request has expired."
      );
    }

    if (oauthError) {
      console.warn(
        "[GOOGLE OAUTH] User declined/Google returned error:",
        oauthError
      );

      return res.redirect(
        "/dashboard.html?google=cancelled"
      );
    }

    if (!code) {
      return res.status(400).send(
        "Google authorization code missing."
      );
    }

    const {
      client,
      tokens,
    } = await exchangeGoogleCode(code);

    client.setCredentials(tokens);

    const account =
      await getGoogleAccount(client);

    const connection =
      await createGoogleConnection({
        userId: oauthState.user_id,
        email: account.email,
        tokens,
      });

      await supabase
        .from("oauth_states")
        .update({
          consumed_at:
            new Date().toISOString(),
        })
        .eq("id", oauthState.id);

      console.log(
        "[GOOGLE OAUTH] Connection created:",
        {
          userId: oauthState.user_id,
          connectionId: connection.id,
          email: account.email,
        }
      );

    return res.redirect(
      "https://bzade.app/dashboard.html?google=connected"
    );

  } catch (error) {
    console.error(
      "[GOOGLE OAUTH CALLBACK]",
      error
    );

    return res.redirect(
      "https://bzade.app/dashboard.html?google=failed"
    );
  }
}