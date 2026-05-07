import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

// Derive a 32-byte key from JWT_SECRET using SHA-256
function getKey(): Buffer {
  const secret = process.env.JWT_SECRET || "fallback-dev-secret-change-in-production";
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypt a string using AES-256-GCM
 * Returns: base64(iv):base64(authTag):base64(ciphertext)
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return "";
  const key = getKey();
  const iv  = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a string encrypted with encrypt()
 * Returns the original plaintext or empty string on failure
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return "";
  // Not encrypted (legacy plain text) — return as-is
  if (!ciphertext.includes(":")) return ciphertext;

  try {
    const [ivB64, authTagB64, encryptedB64] = ciphertext.split(":");
    const key       = getKey();
    const iv        = Buffer.from(ivB64, "base64");
    const authTag   = Buffer.from(authTagB64, "base64");
    const encrypted = Buffer.from(encryptedB64, "base64");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return decipher.update(encrypted) + decipher.final("utf8");
  } catch {
    // Return original if decryption fails (e.g. legacy data)
    return ciphertext;
  }
}

/**
 * Hash a string using SHA-256 (one-way, for lookups)
 */
export function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value.toLowerCase().trim()).digest("hex");
}

/**
 * Mask a CPF for display: 418.***.*08-85 → shows first 3 and last 2 digits
 */
export function maskCPFDisplay(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return "***.***.***-**";
  return `${d.slice(0,3)}.***.*${d.slice(7,10)}-${d.slice(9,11)}`;
}
