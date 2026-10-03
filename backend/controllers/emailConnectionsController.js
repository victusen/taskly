import {
  createCustomSmtpConnection,
} from "../services/emailConnectionService.js";

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

    return res.status(500).json({
      message:
        "Unable to add email connection.",
    });
  }
}