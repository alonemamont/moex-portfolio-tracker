// @vitest-environment node
import { describe, it, expect } from "vitest";
import { encryptToken, decryptToken, TokenDecryptionError } from "./crypto";

describe("encryptToken / decryptToken", () => {
  it("round-trips a token through the correct passphrase", async () => {
    const encrypted = await encryptToken("secret-token-value", "correct horse battery staple");
    const decrypted = await decryptToken(encrypted, "correct horse battery staple");
    expect(decrypted).toBe("secret-token-value");
  });

  it("produces a different ciphertext/iv/salt on each call (random salt+iv)", async () => {
    const first = await encryptToken("secret-token-value", "passphrase");
    const second = await encryptToken("secret-token-value", "passphrase");
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.salt).not.toBe(second.salt);
    expect(first.iv).not.toBe(second.iv);
  });

  it("throws TokenDecryptionError for the wrong passphrase", async () => {
    const encrypted = await encryptToken("secret-token-value", "correct-passphrase");
    await expect(decryptToken(encrypted, "wrong-passphrase")).rejects.toThrow(TokenDecryptionError);
  });
});
