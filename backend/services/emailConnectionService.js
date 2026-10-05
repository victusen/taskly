import crypto from "node:crypto";
import { supabase } from "../config/supabase.js";
import {
  encryptJson,
  decryptJson,
} from "../utils/credentialCrypto.js";

export async function createCustomSmtpConnection({
  userId,
  emailAddress,
  host,
  port,
  secure,
  username,
  password,
}) {
  const encryptedPassword = encryptJson({
    host,
    port,
    secure,
    username,
    password,
  });

  const { data, error } = await supabase
    .from("email_connections")
    .insert({
      user_id: userId,
      provider: "custom",
      connection_type: "smtp",
      email_address: emailAddress,
      credentials: encryptedPassword,
    })
    .select(
      "id, provider, connection_type, email_address, status, created_at"
    )
    .single();

  if (error) {
    throw error;
  }

  return data;
}


export async function createGoogleConnection({
  userId,
  email,
  tokens,
}) {
  const {
    data: existing,
    error: existingError,
  } = await supabase
    .from("email_connections")
    .select("id, credentials")
    .eq("user_id", userId)
    .eq("provider", "google")
    .eq("email_address", email)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  let previousCredentials = null;

  if (existing?.credentials) {
    previousCredentials =
      decryptJson(existing.credentials);
  }

  const credentials = {
    access_token:
      tokens.access_token ||
      previousCredentials?.access_token ||
      null,

    refresh_token:
      tokens.refresh_token ||
      previousCredentials?.refresh_token ||
      null,

    expiry_date:
      tokens.expiry_date ||
      previousCredentials?.expiry_date ||
      null,

    scope:
      tokens.scope ||
      previousCredentials?.scope ||
      null,

    token_type:
      tokens.token_type ||
      previousCredentials?.token_type ||
      "Bearer",
  };

  if (!credentials.refresh_token) {
    throw new Error(
      "Google refresh token was not provided."
    );
  }

  const encrypted =
    encryptJson(credentials);

  const {
    data,
    error,
  } = await supabase
    .from("email_connections")
    .upsert(
      {
        user_id: userId,
        provider: "google",
        connection_type: "oauth2",
        email_address: email,
        credentials: encrypted,
      },
      {
        onConflict:
          "user_id,provider,email_address",
      }
    )
    .select(
      "id, provider, connection_type, email_address, created_at"
    )
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function listConnections(userId) {
  const { data, error } = await supabase
    .from("email_connections")
    .select("id, provider, connection_type, email_address, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data;
}