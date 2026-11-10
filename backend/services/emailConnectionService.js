import { supabase } from "../config/supabase.js";
import {
  encryptJson,
  decryptJson,
} from "../utils/credentialCrypto.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class EmailConnectionError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function assertOwnedProject(userId, projectId) {
  if (!UUID_PATTERN.test(String(projectId || ""))) {
    throw new EmailConnectionError(400, "INVALID_PROJECT", "A valid project is required.");
  }

  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new EmailConnectionError(404, "NOT_FOUND", "Project not found or you do not have permission to access it.");
  }
}

export async function assertProjectCanConnect(userId, projectId, { allowExistingGoogle = false } = {}) {
  await assertOwnedProject(userId, projectId);
  const { data, error } = await supabase
    .from("email_connections")
    .select("id, provider, status, email_address")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) throw error;
  if (allowExistingGoogle && data && data.provider !== "google") {
    throw new EmailConnectionError(409, "NON_GOOGLE_CONNECTION", "This project's mail account is not a Google account.");
  }
  if (
    data?.status === "active" &&
    !(allowExistingGoogle && data.provider === "google")
  ) {
    throw new EmailConnectionError(409, "CONNECTION_EXISTS", "This project already has a mail account.");
  }
  return data;
}

export async function createCustomSmtpConnection({
  userId,
  projectId,
  emailAddress,
  host,
  port,
  secure,
  username,
  password,
}) {
  await assertOwnedProject(userId, projectId);

  const encryptedPassword = encryptJson({
    host,
    port,
    secure,
    username,
    password,
  });

  const { data: existing, error: existingError } = await supabase
    .from("email_connections")
    .select("id, status")
    .eq("project_id", projectId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.status === "active") {
    throw new EmailConnectionError(409, "CONNECTION_EXISTS", "This project already has a mail account.");
  }

  const query = existing
    ? supabase
      .from("email_connections")
      .update({
        provider: "custom",
        connection_type: "smtp",
        email_address: emailAddress,
        credentials: encryptedPassword,
        status: "active",
      })
      .eq("id", existing.id)
    : supabase
      .from("email_connections")
      .insert({
        project_id: projectId,
        provider: "custom",
        connection_type: "smtp",
        email_address: emailAddress,
        credentials: encryptedPassword,
        status: "active",
      });

  const { data, error } = await query
    .select("id, project_id, provider, connection_type, email_address, status, created_at")
    .single();

  if (error) {
    throw error;
  }

  return data;
}


export async function createGoogleConnection({
  projectId,
  email,
  tokens,
}) {
  const {
    data: existing,
    error: existingError,
  } = await supabase
    .from("email_connections")
    .select("id, credentials")
    .eq("project_id", projectId)
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

  const query = existing
    ? supabase
      .from("email_connections")
      .update({
        provider: "google",
        connection_type: "oauth2",
        email_address: email,
        credentials: encrypted,
        status: "active",
      })
      .eq("id", existing.id)
    : supabase
      .from("email_connections")
      .insert({
        project_id: projectId,
        provider: "google",
        connection_type: "oauth2",
        email_address: email,
        credentials: encrypted,
        status: "active",
      });

  const { data, error } = await query
    .select("id, project_id, provider, connection_type, email_address, status, created_at")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function listConnections(userId) {
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active");

  if (projectsError) throw projectsError;
  const projectIds = (projects || []).map((project) => project.id);
  if (projectIds.length === 0) return [];

  const { data, error } = await supabase
    .from("email_connections")
    .select("id, project_id, provider, connection_type, email_address, status, created_at")
    .in("project_id", projectIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data;
}

export async function getProjectConnection(userId, projectId) {
  await assertOwnedProject(userId, projectId);
  const { data, error } = await supabase
    .from("email_connections")
    .select("id, project_id, provider, connection_type, email_address, status, last_used_at, created_at, updated_at")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function deleteConnection(userId, connectionId) {
  const { data: connection, error: connectionError } = await supabase
    .from("email_connections")
    .select("id, project_id")
    .eq("id", connectionId)
    .maybeSingle();

  if (connectionError) throw connectionError;
  if (!connection) return null;
  await assertOwnedProject(userId, connection.project_id);

  const { data, error } = await supabase
    .from("email_connections")
    .delete()
    .eq("id", connectionId)
    .eq("project_id", connection.project_id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data;
}