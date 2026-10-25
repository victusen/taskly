import {
  createCustomSmtpConnection,
  listConnections,
  deleteConnection
} from "../services/emailConnectionService.js";
import { assertPublicHost } from "../utils/networkGuard.js";


const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ALLOWED_SMTP_PORTS = new Set([
  25,
  465,
  587,
  2525,
]);

export async function createEmailConnection(req, res) {
  try {
    const {
      emailAddress,
      host,
      port,
      secure,
      username,
      password,
    } = req.body;

    if (
      typeof emailAddress !== "string" ||
      !EMAIL_REGEX.test(emailAddress.trim())
    ) {
      return res.status(400).json({
        message: "A valid sender email address is required.",
      });
    }

    if (
      typeof host !== "string" ||
      host.trim().length < 1 ||
      host.trim().length > 255
    ) {
      return res.status(400).json({
        message: "A valid SMTP host is required.",
      });
    }

    const numericPort = Number(port);

    if (
      !Number.isInteger(numericPort) ||
      !ALLOWED_SMTP_PORTS.has(numericPort)
    ) {
      return res.status(400).json({
        message:
          "SMTP port must be 25, 465, 587, or 2525.",
      });
    }

    if (typeof secure !== "boolean") {
      return res.status(400).json({
        message:
          "SMTP secure must be true or false.",
      });
    }

    if (
      typeof username !== "string" ||
      username.trim().length < 1 ||
      username.trim().length > 320
    ) {
      return res.status(400).json({
        message: "SMTP username is required.",
      });
    }

    if (
      typeof password !== "string" ||
      password.length < 1 ||
      password.length > 1000
    ) {
      return res.status(400).json({
        message: "SMTP password is required.",
      });
    }

    // Reject private/internal SMTP hosts before saving.
    try {
      await assertPublicHost(host.trim().toLowerCase());
    } catch {
      return res.status(400).json({
        message: "That SMTP host address is not allowed.",
      });
    }

    const connection =
      await createCustomSmtpConnection({
        userId: req.user.id,

        emailAddress:
          emailAddress.trim().toLowerCase(),

        host: host.trim().toLowerCase(),

        port: numericPort,

        secure,

        username: username.trim(),

        password,
      });

    return res.status(201).json({
      message:
        "Email connection added successfully.",
      connection,
    });

  } catch (error) {
    console.error(
      "[EMAIL CONNECTION CREATE]",
      error
    );

    return res.status(500).json({ success: false, code: "SERVER_ERROR", message: "Unable to load email connections." });
  }
}

export async function listEmailConnections(req, res) {
  try {
    const data = await listConnections(req.user.id);

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("[EMAIL CONNECTION LIST]", error);

    return res.status(500).json({ success: false, code: "SERVER_ERROR", message: "Unable to load email connections." });
  }
}

export async function deleteEmailConnection(req, res) {
  try {
    const removed = await deleteConnection(req.user.id, req.params.id);
    if (!removed) {
      return res.status(404).json({ success: false, code: "NOT_FOUND", message: "Connection not found." });
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[EMAIL CONNECTION DELETE]", error);
    return res.status(500).json({ success: false, code: "SERVER_ERROR", message: "Unable to disconnect." });
  }
}