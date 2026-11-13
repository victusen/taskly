// services/sendService.js
// Sends one scheduled email occurrence through the user's connected account.
// Supports Gmail OAuth2 and custom SMTP.
//
// Called by runSchedule.js as:
//   sendScheduledEmail({ connection, credentials, config })
//
// connection  — the email_connections row (provider, connection_type, email_address, status)
// credentials — the decrypted credentials object (already decrypted by runSchedule.js)
// config      — { recipients: string[], subject: string, body: string, body_type: "html"|"text" }
//
// Returns { failures: [{ to, reason }] }
// failures is empty on full success, or contains the addresses that were rejected.

import { google } from "googleapis";
import nodemailer from "nodemailer";
import { waitForSpreadsheetSendSlot } from "./sendRateLimiter.js";

// Gmail OAuth2 

// Builds a raw RFC 2822 email string encoded as base64url, which is what
// the Gmail API requires.
// "base64url" uses - and _ instead of + and / and has no padding — Gmail rejects
// standard base64 here.
function buildRawMessage({ from, recipients, subject, body, bodyType }) {
  const to = recipients.join(", ");
  const contentType = bodyType === "html" ? "text/html" : "text/plain";
  // RFC 2822: headers and body are separated by a blank line (\r\n\r\n).
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: ${contentType}; charset=UTF-8`,
    ``,
    body,
  ].join("\r\n");

  return Buffer.from(message).toString("base64url");
}

async function sendViaGmail({ connection, credentials, config }) {
  // googleapis OAuth2Client takes the same client id/secret used in the
  // OAuth flow. It uses the refresh_token to automatically get a new
  // access_token when the current one is expired.
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token:  credentials.access_token,
    refresh_token: credentials.refresh_token,
    expiry_date:   credentials.expiry_date,
    token_type:    credentials.token_type || "Bearer",
    scope:         credentials.scope,
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // TRACKING: inject open-pixel and rewrite click links into config.body here
  // before building the raw message, when you add a tracking service.

  const raw = buildRawMessage({
    from:       connection.email_address,
    recipients: config.recipients,
    subject:    config.subject,
    body:       config.body,
    bodyType:   config.body_type,
  });

  try {
    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
  } catch (err) {
    // Google throws "invalid_grant" when the refresh token has been revoked.
    // runSchedule.js checks err.code === "GMAIL_REVOKED" to mark the
    // connection as expired and stop retrying.
    const isRevoked =
      err?.response?.data?.error === "invalid_grant" ||
      String(err?.message || "").toLowerCase().includes("invalid_grant");

    if (isRevoked) {
      const revoked = new Error("Gmail access has been revoked. Reconnect the account.");
      revoked.code = "GMAIL_REVOKED";
      revoked.permanent = true;
      throw revoked;
    }

    // Any other Gmail error is thrown as-is. runSchedule.js will retry it.
    throw err;
  }

  // Gmail does not report per-recipient rejections synchronously.
  // Bounces come back as delivery status notifications to the sender's inbox.
  return { failures: [] };
}

// ─── Custom SMTP (nodemailer) ─────────────────────────────────────────────────

async function sendViaSmtp({ connection, credentials, config }) {
  // createTransport opens a connection pool to the SMTP server.
  // host, port, secure, username, password came from the encrypted credentials
  // the user saved when they added the SMTP connection.
  const transporter = nodemailer.createTransport({
    host:   credentials.host,
    port:   credentials.port,
    secure: credentials.secure,    // true = TLS on connect (port 465), false = STARTTLS
    auth: {
      user: credentials.username,
      pass: credentials.password,
    },
    // Reject self-signed certs. If this causes issues with a legitimate provider,
    // the user should use port 465 with a valid certificate.
    tls: { rejectUnauthorized: true },
  });

  // TRACKING: inject open-pixel and rewrite click links into config.body here
  // before sending, when you add a tracking service.

  const mailOptions = {
    from:    connection.email_address,
    to:      config.recipients,        // nodemailer accepts an array
    subject: config.subject,
    [config.body_type === "html" ? "html" : "text"]: config.body,
  };

  let info;
  try {
    info = await transporter.sendMail(mailOptions);
  } finally {
    // Close the connection pool so the process does not stay open.
    transporter.close();
  }

  // nodemailer puts addresses the SMTP server rejected into info.rejected.
  // We map each one to the { to, reason } shape runSchedule.js expects.
  const failures = (info.rejected || []).map((addr) => ({
    to:     addr,
    reason: "Rejected by SMTP server.",
  }));

  return { failures };
}

// ─── Public export ────────────────────────────────────────────────────────────

export async function sendScheduledEmail({ connection, credentials, config }) {
  if (connection.connection_type === "oauth2") {
    return sendViaGmail({ connection, credentials, config });
  }

  if (connection.connection_type === "smtp") {
    return sendViaSmtp({ connection, credentials, config });
  }

  // Any other type stored in the DB means a future provider not yet implemented.
  const err = new Error(`Unsupported connection type: ${connection.connection_type}`);
  err.permanent = true;
  throw err;
}

function isRevokedGoogleGrant(error) {
  return (
    error?.response?.data?.error === "invalid_grant" ||
    String(error?.message || "").toLowerCase().includes("invalid_grant")
  );
}

function isGmailRateLimitError(error) {
  const status = Number(error?.response?.status || error?.code);
  const reasons = (error?.response?.data?.error?.errors || []).map((item) => item.reason);
  return status === 429 || reasons.some((reason) => (
    reason === "rateLimitExceeded" || reason === "userRateLimitExceeded"
  ));
}

async function sendGmailMessageWithBackoff(gmail, raw) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw },
      });
      return;
    } catch (error) {
      if (!isGmailRateLimitError(error) || attempt >= 3) throw error;
      const delay = Math.min(30_000, (2 ** attempt) * 1_000 + Math.floor(Math.random() * 1_000));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function revokedGoogleError() {
  const error = new Error("Google access has been revoked. Reconnect the account.");
  error.code = "GMAIL_REVOKED";
  error.permanent = true;
  return error;
}

async function sendPersonalizedViaGmail({ connection, credentials, messages }) {
  if (!credentials.refresh_token) throw revokedGoogleError();

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  oauth2Client.setCredentials({
    access_token: credentials.access_token,
    refresh_token: credentials.refresh_token,
    expiry_date: credentials.expiry_date,
    token_type: credentials.token_type || "Bearer",
    scope: credentials.scope,
  });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const failures = [];
  let sentCount = 0;

  for (const message of messages) {
    await waitForSpreadsheetSendSlot(connection.id || `${connection.connection_type}:${connection.email_address}`);
    const raw = buildRawMessage({
      from: connection.email_address,
      recipients: message.recipients,
      subject: message.subject,
      body: message.body,
      bodyType: message.body_type,
    });

    try {
      await sendGmailMessageWithBackoff(gmail, raw);
      sentCount += 1;
    } catch (error) {
      if (isRevokedGoogleGrant(error)) throw revokedGoogleError();
      failures.push({
        to: message.recipients.join(", "),
        reason: error?.message || "Gmail rejected this message.",
      });
    }
  }

  return { failures, sentCount };
}

async function sendPersonalizedViaSmtp({ connection, credentials, messages }) {
  const transporter = nodemailer.createTransport({
    host: credentials.host,
    port: credentials.port,
    secure: credentials.secure,
    auth: {
      user: credentials.username,
      pass: credentials.password,
    },
    tls: { rejectUnauthorized: true },
  });
  const failures = [];
  let sentCount = 0;

  try {
    for (const message of messages) {
      await waitForSpreadsheetSendSlot(connection.id || `${connection.connection_type}:${connection.email_address}`);
      try {
        const info = await transporter.sendMail({
          from: connection.email_address,
          to: message.recipients,
          subject: message.subject,
          [message.body_type === "html" ? "html" : "text"]: message.body,
        });
        const rejected = info.rejected || [];
        if (rejected.length) {
          failures.push(...rejected.map((address) => ({
            to: address,
            reason: "Rejected by SMTP server.",
          })));
        } else {
          sentCount += 1;
        }
      } catch (error) {
        failures.push({
          to: message.recipients.join(", "),
          reason: error?.message || "SMTP rejected this message.",
        });
      }
    }
  } finally {
    transporter.close();
  }

  return { failures, sentCount };
}

export async function sendPersonalizedEmails({ connection, credentials, messages }) {
  if (connection.connection_type === "oauth2") {
    return sendPersonalizedViaGmail({ connection, credentials, messages });
  }
  if (connection.connection_type === "smtp") {
    return sendPersonalizedViaSmtp({ connection, credentials, messages });
  }
  const error = new Error(`Unsupported connection type: ${connection.connection_type}`);
  error.permanent = true;
  throw error;
}