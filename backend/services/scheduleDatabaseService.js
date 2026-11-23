import { supabase } from "../config/supabase.js";
import { decryptJson, encryptJson } from "../utils/credentialCrypto.js";
import { assertProjectAccess } from "./projectAccessService.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GOOGLE_SHEETS_PROVIDER = "google_sheets";
const CONNECTION_METHOD = "oauth2";

export class ScheduleDatabaseError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function assertConnectionId(connectionId) {
  if (!UUID_PATTERN.test(String(connectionId || ""))) {
    throw new ScheduleDatabaseError(400, "INVALID_CONNECTION", "Choose a valid Google Sheets connection.");
  }
}

function connectionStatusError(status) {
  if (status === "requires_reauth") {
    return new ScheduleDatabaseError(
      409,
      "SCHEDULE_DATABASE_REAUTH_REQUIRED",
      "Reconnect this Google Sheets account before using it.",
    );
  }
  if (status === "disconnected") {
    return new ScheduleDatabaseError(
      409,
      "SCHEDULE_DATABASE_DISCONNECTED",
      "This Google Sheets account is disconnected. Connect it again to continue.",
    );
  }
  return new ScheduleDatabaseError(
    409,
    "SCHEDULE_DATABASE_UNAVAILABLE",
    "This Google Sheets connection is unavailable.",
  );
}

export async function listProjectScheduleDatabases(userId, projectId) {
  await assertProjectAccess(userId, projectId, { allowedStatuses: ["active", "paused"] });
  const { data, error } = await supabase
    .from("schedule_databases")
    .select("id, project_id, provider, connection_method, account_email, status, last_used_at, created_at, updated_at")
    .eq("project_id", projectId)
    .eq("provider", GOOGLE_SHEETS_PROVIDER)
    .eq("connection_method", CONNECTION_METHOD)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getProjectScheduleDatabase(userId, projectId, connectionId, { allowInactive = false } = {}) {
  assertConnectionId(connectionId);
  await assertProjectAccess(userId, projectId, { allowedStatuses: ["active", "paused"] });
  const { data, error } = await supabase
    .from("schedule_databases")
    .select("*")
    .eq("id", connectionId)
    .eq("project_id", projectId)
    .eq("provider", GOOGLE_SHEETS_PROVIDER)
    .eq("connection_method", CONNECTION_METHOD)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new ScheduleDatabaseError(404, "SCHEDULE_DATABASE_NOT_FOUND", "Google Sheets connection not found for this project.");
  }
  if (!allowInactive && data.status !== "active") throw connectionStatusError(data.status);
  return data;
}

export async function getScheduleDatabaseForExecution(projectId, connectionId) {
  assertConnectionId(connectionId);
  const { data, error } = await supabase
    .from("schedule_databases")
    .select("*")
    .eq("id", connectionId)
    .eq("project_id", projectId)
    .eq("provider", GOOGLE_SHEETS_PROVIDER)
    .eq("connection_method", CONNECTION_METHOD)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const unavailable = new ScheduleDatabaseError(
      409,
      "SCHEDULE_DATABASE_MISSING",
      "Reconnect Google Sheets for this project and update this schedule.",
    );
    unavailable.permanent = true;
    throw unavailable;
  }
  if (data.status !== "active") {
    const unavailable = connectionStatusError(data.status);
    unavailable.permanent = true;
    throw unavailable;
  }
  return data;
}

export async function assertActiveScheduleDatabase(userId, projectId, connectionId) {
  const connection = await getProjectScheduleDatabase(userId, projectId, connectionId);
  return {
    id: connection.id,
    provider: connection.provider,
    status: connection.status,
  };
}

export async function upsertGoogleSheetsDatabase({
  userId,
  projectId,
  account,
  tokens,
}) {
  await assertProjectAccess(userId, projectId, { allowedStatuses: ["active", "paused"] });
  if (!account?.id || !account.email) {
    throw new ScheduleDatabaseError(502, "GOOGLE_ACCOUNT_UNAVAILABLE", "Google did not return the account identity.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("schedule_databases")
    .select("id, credentials, connection_config")
    .eq("project_id", projectId)
    .eq("provider", GOOGLE_SHEETS_PROVIDER)
    .eq("provider_account_id", String(account.id))
    .maybeSingle();
  if (existingError) throw existingError;

  let previousCredentials = {};
  if (existing?.credentials) {
    try {
      previousCredentials = decryptJson(existing.credentials);
    } catch (error) {
      if (/BZADE_CREDENTIAL_ENCRYPTION_KEY/.test(error.message || "")) throw error;
      if (!tokens.refresh_token) {
        throw new ScheduleDatabaseError(
          409,
          "GOOGLE_REFRESH_TOKEN_REQUIRED",
          "The saved Google Sheets credentials cannot be decrypted. Reconnect and approve offline access to replace them.",
        );
      }
      console.warn("[GOOGLE SHEETS] Replacing credentials that cannot be decrypted after a new OAuth grant.", {
        projectId,
        connectionId: existing.id,
      });
    }
  }
  const credentials = {
    ...previousCredentials,
    ...tokens,
    refresh_token: tokens.refresh_token || previousCredentials.refresh_token || null,
    scope: tokens.scope || previousCredentials.scope || null,
    token_type: tokens.token_type || previousCredentials.token_type || "Bearer",
  };
  if (!credentials.refresh_token) {
    throw new ScheduleDatabaseError(
      409,
      "GOOGLE_REFRESH_TOKEN_REQUIRED",
      "Google did not provide offline access. Reconnect and approve the requested permissions.",
    );
  }

  const scopes = String(credentials.scope || "").split(/\s+/).filter(Boolean);
  const connectionConfig = { ...(existing?.connection_config || {}) };
  delete connectionConfig.account_name;
  const row = {
    project_id: projectId,
    provider: GOOGLE_SHEETS_PROVIDER,
    connection_method: CONNECTION_METHOD,
    account_email: account.email,
    provider_account_id: String(account.id),
    credentials: encryptJson(credentials),
    connection_config: {
      ...connectionConfig,
      scopes,
    },
    status: "active",
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("schedule_databases")
    .upsert(row, { onConflict: "project_id,provider,provider_account_id" })
    .select("id, project_id, provider, connection_method, account_email, status, last_used_at, created_at, updated_at")
    .single();
  if (error) throw error;
  return data;
}

export async function updateGoogleSheetsCredentials(connection, credentials) {
  const { data, error } = await supabase
    .from("schedule_databases")
    .update({
      credentials: encryptJson(credentials),
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id)
    .eq("project_id", connection.project_id)
    .eq("provider", GOOGLE_SHEETS_PROVIDER)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const unavailable = new ScheduleDatabaseError(
      409,
      "SCHEDULE_DATABASE_DISCONNECTED",
      "This Google Sheets connection changed while credentials were refreshing. Reconnect it and try again.",
    );
    unavailable.permanent = true;
    throw unavailable;
  }
}

export async function markGoogleSheetsRequiresReauth(connection) {
  const { error } = await supabase
    .from("schedule_databases")
    .update({ status: "requires_reauth", updated_at: new Date().toISOString() })
    .eq("id", connection.id)
    .eq("project_id", connection.project_id)
    .eq("provider", GOOGLE_SHEETS_PROVIDER)
    .eq("status", "active");
  if (error) throw error;
}

export async function markGoogleSheetsUsed(connection) {
  const { error } = await supabase
    .from("schedule_databases")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", connection.id)
    .eq("project_id", connection.project_id)
    .eq("provider", GOOGLE_SHEETS_PROVIDER);
  if (error) throw error;
}

export async function disconnectProjectScheduleDatabase(userId, projectId, connectionId) {
  const connection = await getProjectScheduleDatabase(userId, projectId, connectionId, { allowInactive: true });
  const { data: activeSchedules, error: schedulesError } = await supabase
    .from("schedules")
    .select("id, config")
    .eq("project_id", projectId)
    .eq("status", "active");
  if (schedulesError) throw schedulesError;

  const scheduleIds = (activeSchedules || [])
    .filter((schedule) =>
      schedule.config?.recipient_source?.connection_id === connection.id
      || schedule.config?.spreadsheet?.connection_id === connection.id,
    )
    .map((schedule) => schedule.id);
  if (scheduleIds.length) {
    const { error } = await supabase
      .from("schedules")
      .update({
        status: "paused",
        next_run_at: null,
        last_failure_reason: "Google Sheets was disconnected. Reconnect it and resume this schedule.",
      })
      .in("id", scheduleIds)
      .eq("project_id", projectId)
      .eq("status", "active");
    if (error) throw error;
  }

  const { data, error } = await supabase
    .from("schedule_databases")
    .update({
      credentials: encryptJson({}),
      status: "disconnected",
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id)
    .eq("project_id", projectId)
    .select("id, project_id, provider, connection_method, account_email, status, last_used_at, created_at, updated_at")
    .single();
  if (error) throw error;
  return data;
}
