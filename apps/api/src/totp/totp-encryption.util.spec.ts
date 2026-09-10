process.env.TOTP_ENCRYPTION_KEY = "test-only-totp-encryption-key";

import { encryptTotpSecret, decryptTotpSecret } from "./totp-encryption.util";

describe("totp-encryption.util", () => {
  it("round-trips a secret through encrypt/decrypt", () => {
    const plaintext = "JBSWY3DPEHPK3PXP";

    const encrypted = encryptTotpSecret(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(decryptTotpSecret(encrypted)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV) even for the same plaintext", () => {
    const plaintext = "JBSWY3DPEHPK3PXP";

    const a = encryptTotpSecret(plaintext);
    const b = encryptTotpSecret(plaintext);

    expect(a).not.toBe(b);
    expect(decryptTotpSecret(a)).toBe(plaintext);
    expect(decryptTotpSecret(b)).toBe(plaintext);
  });

  it("rejects a tampered ciphertext instead of silently returning garbage", () => {
    const encrypted = encryptTotpSecret("JBSWY3DPEHPK3PXP");
    const [iv, authTag, ciphertext] = encrypted.split(":");
    // Flip a character in the ciphertext — GCM's auth tag must reject this.
    const tamperedChar = ciphertext[0] === "a" ? "b" : "a";
    const tampered = `${iv}:${authTag}:${tamperedChar}${ciphertext.slice(1)}`;

    expect(() => decryptTotpSecret(tampered)).toThrow();
  });
});
