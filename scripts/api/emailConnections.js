import { supabase } from "../auth/auth.js";
import { BACKEND_URL } from "../config.js";

export async function addEmailConnection({
  emailAddress,
  host,
  port,
  secure,
  username,
  password,
}) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(
      "Unable to verify your session."
    );
  }

  if (!session?.access_token) {
    throw new Error(
      "You must be signed in."
    );
  }

  const response = await fetch(
    `http://localhost:3000/api/email-connections`,
    {
      method: "POST",

      headers: {
        "Authorization":
          `Bearer ${session.access_token}`,

        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        emailAddress,
        host,
        port,
        secure,
        username,
        password,
      }),
    }
  );

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "Invalid response from server."
    );
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
      "Failed to add email connection."
    );
  }

  return data;
}

export async function startGoogleConnection() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw new Error(
      "Unable to verify your session."
    );
  }

  if (!session?.access_token) {
    window.location.href = "login.html";
    return;
  }

  const response = await fetch(
    `${BACKEND_URL}/api/email-connections/google/start`,
    {
      method: "GET",

      headers: {
        Authorization:
          `Bearer ${session.access_token}`,
      },
    }
  );

  let data = {};

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "Invalid server response."
    );
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
      "Unable to start Google connection."
    );
  }

  if (!data.authorizationUrl) {
    throw new Error(
      "Google authorization URL was not returned."
    );
  }

  window.location.href =
    data.authorizationUrl;
}