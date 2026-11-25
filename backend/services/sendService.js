// services/sendService.js
// Sends one scheduled email occurrence through the user's connected account.
// Supports Gmail OAuth2 and custom SMTP.
//
// Called by runSchedule.js as:
//   sendScheduledEmail({ connection, credentials, config })
//
// connection  — the email_connections row (provider, connection_type, email_address, status)
// credentials — the decrypted credentials object (already decrypted by runSchedule.js)
// config      — { recipients: string[], cc?: string[], bcc?: string[], subject: string, body: string, body_type: "html"|"text" }
//
// Returns { failures: [{ to, reason }], sentRecipients: number }
// failures is empty on full success, or contains the addresses that were rejected.

import { google } from "googleapis";
import nodemailer from "nodemailer";
import { waitForSpreadsheetSendSlot } from "./sendRateLimiter.js";

// Gmail OAuth2 

// Builds a raw RFC 2822 email string encoded as base64url, which is what
// the Gmail API requires.
// "base64url" uses - and _ instead of + and / and has no padding — Gmail rejects
// standard base64 here.
function formatFromHeader(emailAddress, senderName) {
  const name = String(senderName || "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!name) return emailAddress;
  const phrase = /^[\x20-\x7e]*$/.test(name)
    ? `"${name.replace(/(["\\])/g, "\\$1")}"`
    : `=?UTF-8?B?${Buffer.from(name, "utf8").toString("base64")}?=`;
  return `${phrase} <${emailAddress}>`;
}

export function buildRawMessage({ from, fromName, recipients, cc = [], bcc = [], subject, body, bodyType }) {
  const to = recipients.join(", ");
  const contentType = bodyType === "html" ? "text/html" : "text/plain";
  const headers = [
    `From: ${formatFromHeader(from, fromName)}`,
    `To: ${to}`,
  ];
  if (cc.length) headers.push(`Cc: ${cc.join(", ")}`);
  if (bcc.length) headers.push(`Bcc: ${bcc.join(", ")}`);
  headers.push(
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: ${contentType}; charset=UTF-8`,
    ``,
    body,
  );
  // RFC 2822: headers and body are separated by a blank line (\r\n\r\n).
  const message = headers.join("\r\n");

  return Buffer.from(message).toString("base64url");
}

// ─── Public export ────────────────────────────────────────────────────────────

export function createRecipientMessages(config) {
  return config.recipients.map((recipient) => ({
    recipients: [recipient],
    cc: config.cc || [],
    bcc: config.bcc || [],
    subject: config.subject,
    body: config.body,
    body_type: config.body_type,
  }));
}

export async function sendScheduledEmail({ connection, credentials, config }) {
  return sendPersonalizedEmails({
    connection,
    credentials,
    messages: createRecipientMessages(config),
    senderName: config.sender_name,
  });
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

async function sendPersonalizedViaGmail({ connection, credentials, messages, senderName }) {
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
  let sentRecipients = 0;

  for (const message of messages) {
    await waitForSpreadsheetSendSlot(connection.id || `${connection.connection_type}:${connection.email_address}`);
    const raw = buildRawMessage({
      from: connection.email_address,
      fromName: senderName,
      recipients: message.recipients,
      cc: message.cc || [],
      bcc: message.bcc || [],
      subject: message.subject,
      body: message.body,
      bodyType: message.body_type,
    });

    try {
      await sendGmailMessageWithBackoff(gmail, raw);
      sentCount += 1;
      sentRecipients +=
        message.recipients.length +
        (message.cc?.length || 0) +
        (message.bcc?.length || 0);
    } catch (error) {
      if (isRevokedGoogleGrant(error)) throw revokedGoogleError();
      failures.push({
        to: message.recipients.join(", "),
        reason: error?.message || "Gmail rejected this message.",
      });
    }
  }

  return { failures, sentCount, sentRecipients };
}

async function sendPersonalizedViaSmtp({ connection, credentials, messages, senderName }) {
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
  let sentRecipients = 0;

  try {
    for (const message of messages) {
      await waitForSpreadsheetSendSlot(connection.id || `${connection.connection_type}:${connection.email_address}`);
      try {
        const info = await transporter.sendMail({
          from: senderName
            ? { name: senderName, address: connection.email_address }
            : connection.email_address,
          to: message.recipients,
          ...(message.cc?.length ? { cc: message.cc } : {}),
          ...(message.bcc?.length ? { bcc: message.bcc } : {}),
          subject: message.subject,
          [message.body_type === "html" ? "html" : "text"]: message.body,
        });
        const rejected = info.rejected || [];
        const acceptedCount = Array.isArray(info.accepted)
          ? info.accepted.length
          : Math.max(
            0,
            message.recipients.length + (message.cc?.length || 0) + (message.bcc?.length || 0) - rejected.length,
          );
        sentRecipients += acceptedCount;
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

  return { failures, sentCount, sentRecipients };
}

export async function sendPersonalizedEmails({ connection, credentials, messages, senderName }) {
  if (connection.connection_type === "oauth2") {
    return sendPersonalizedViaGmail({ connection, credentials, messages, senderName });
  }
  if (connection.connection_type === "smtp") {
    return sendPersonalizedViaSmtp({ connection, credentials, messages, senderName });
  }
  const error = new Error(`Unsupported connection type: ${connection.connection_type}`);
  error.permanent = true;
  throw error;
}