import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// AES-256-GCM at-rest encryption for User.totpSecret specifically — unlike a
// password (hashed, never needs to come back), a TOTP secret must be
// recoverable in plaintext on every login to compute the current code, so
// hashing isn't an option here; encryption is the right primitive instead.
// TOTP_ENCRYPTION_KEY is a separate secret from every JWT_* key: rotating it
// would invalidate every enrolled user's stored secret (they'd all need to
// re-enroll), so it's deliberately never reused for anything else that
// rotates more casually.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function deriveKey(): Buffer {
  const raw = process.env.TOTP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("TOTP_ENCRYPTION_KEY is not set — required to encrypt/decrypt TOTP secrets");
  }
  // scrypt rather than using raw/raw-hashed bytes directly — tolerates a
  // human-chosen passphrase-shaped env var just as well as a generated
  // random one, with a fixed-length key either way.
  return scryptSync(raw, "totp-secret-encryption", 32);
}

// Format: iv:authTag:ciphertext, each hex — one column, no extra table.
export function encryptTotpSecret(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptTotpSecret(stored: string): string {
  const [ivHex, authTagHex, ciphertextHex] = stored.split(":");
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error("Malformed encrypted TOTP secret");
  }
  const key = deriveKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
  return plaintext.toString("utf8");
}
