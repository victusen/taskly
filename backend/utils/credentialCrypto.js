import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getEncryptionKey() {
  const value =
    process.env.TASKLY_CREDENTIAL_ENCRYPTION_KEY;

  if (!value) {
    throw new Error(
      "BZADE_CREDENTIAL_ENCRYPTION_KEY is not configured."
    );
  }

  if (!/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(
      "BZADE_CREDENTIAL_ENCRYPTION_KEY must contain exactly 64 hexadecimal characters."
    );
  }

  return Buffer.from(value, "hex");
}

export function encryptJson(value) {
  const key = getEncryptionKey();

  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(
    ALGORITHM,
    key,
    iv
  );

  const plaintext =
    JSON.stringify(value);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag =
    cipher.getAuthTag();

  return {
    ciphertext:
      ciphertext.toString("base64"),

    iv:
      iv.toString("base64"),

    authTag:
      authTag.toString("base64"),
  };
}

export function decryptJson(payload) {
  const key = getEncryptionKey();

  const decipher =
    crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(
        payload.iv,
        "base64"
      )
    );

  decipher.setAuthTag(
    Buffer.from(
      payload.authTag,
      "base64"
    )
  );

  const plaintext =
    Buffer.concat([
      decipher.update(
        Buffer.from(
          payload.ciphertext,
          "base64"
        )
      ),
      decipher.final(),
    ]).toString("utf8");

  return JSON.parse(plaintext);
}

export function hashState(state) {
  return crypto
    .createHash("sha256")
    .update(state)
    .digest("hex");
}