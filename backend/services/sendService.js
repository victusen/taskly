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