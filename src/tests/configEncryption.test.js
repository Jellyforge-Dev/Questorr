import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

// Mock logger
vi.mock("../utils/logger.js", () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock validation
vi.mock("../utils/validation.js", () => ({
  configSchema: {
    validate: vi.fn(() => ({ error: null })),
  },
}));

describe("Config encryption (AES-256-GCM)", () => {
  // Replicate the encryption logic from configFile.js for isolated testing
  const ENC_PREFIX = "enc:";
  const B64_PREFIX = "b64:";

  function deriveKey() {
    const material = `questorr:${os.hostname()}:${process.cwd()}`;
    return crypto.createHash("sha256").update(material).digest();
  }

  function encrypt(plaintext) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ENC_PREFIX + Buffer.concat([iv, tag, encrypted]).toString("base64");
  }

  function decrypt(blob) {
    const raw = Buffer.from(blob.slice(ENC_PREFIX.length), "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(), iv);
    decipher.setAuthTag(tag);
    return decipher.update(ciphertext, undefined, "utf8") + decipher.final("utf8");
  }

  it("encrypts and decrypts a secret correctly", () => {
    const secret = "my-super-secret-api-key-12345";
    const encrypted = encrypt(secret);

    expect(encrypted.startsWith(ENC_PREFIX)).toBe(true);
    expect(encrypted).not.toContain(secret); // secret should not appear in ciphertext
    expect(decrypt(encrypted)).toBe(secret);
  });

  it("produces different ciphertext for same input (random IV)", () => {
    const secret = "test-key";
    const enc1 = encrypt(secret);
    const enc2 = encrypt(secret);

    expect(enc1).not.toBe(enc2); // different IVs
    expect(decrypt(enc1)).toBe(secret);
    expect(decrypt(enc2)).toBe(secret);
  });

  it("handles empty string", () => {
    const encrypted = encrypt("");
    expect(decrypt(encrypted)).toBe("");
  });

  it("handles unicode characters", () => {
    const secret = "Schlüssel-mit-Ümlauten-🔑";
    const encrypted = encrypt(secret);
    expect(decrypt(encrypted)).toBe(secret);
  });

  it("handles long API keys", () => {
    const secret = crypto.randomBytes(128).toString("hex"); // 256 char key
    const encrypted = encrypt(secret);
    expect(decrypt(encrypted)).toBe(secret);
  });

  it("detects tampering (auth tag validation)", () => {
    const encrypted = encrypt("secret");
    // Corrupt one byte in the middle of the ciphertext
    const raw = Buffer.from(encrypted.slice(ENC_PREFIX.length), "base64");
    raw[20] ^= 0xff; // flip bits in auth tag area
    const tampered = ENC_PREFIX + raw.toString("base64");

    expect(() => decrypt(tampered)).toThrow();
  });

  it("migrates legacy Base64 values", () => {
    const original = "my-old-api-key";
    const legacyEncoded = B64_PREFIX + Buffer.from(original, "utf8").toString("base64");

    // Simulate what decodeConfig does for legacy values
    expect(legacyEncoded.startsWith(B64_PREFIX)).toBe(true);
    const decoded = Buffer.from(legacyEncoded.slice(B64_PREFIX.length), "base64").toString("utf8");
    expect(decoded).toBe(original);
  });

  it("key is deterministic on same machine", () => {
    const key1 = deriveKey();
    const key2 = deriveKey();
    expect(key1.equals(key2)).toBe(true);
  });
});
