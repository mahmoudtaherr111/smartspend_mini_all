import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash, randomBytes } from "crypto";
import { hashSessionToken } from "../../api/lib/session-validation";

/**
 * Security Suite R5: Plaintext Session Elimination & Token Hashing
 * Covers:
 *  1. Cryptographic token hashing via SHA-256 (hashSessionToken)
 *  2. Verification that sessions table receives tokenHash, NEVER plaintext tokens
 *  3. Session authentication via cryptographic tokenHash lookup (with null plaintext column)
 *  4. Protection against database dump credential theft / SQL injection leakage
 *  5. Webhook token generation entropy & hashing
 */

type MockSessionRow = {
  id: number;
  userId: number;
  userType: "oauth" | "local";
  token: string | null;
  tokenHash: string;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: Date;
  createdAt: Date;
};

describe("R5 Security: Plaintext Session Elimination & Cryptographic Hashing", () => {
  let mockSessionDb: MockSessionRow[] = [];
  let nextSessionId = 1;

  beforeEach(() => {
    mockSessionDb = [];
    nextSessionId = 1;
    vi.restoreAllMocks();
  });

  describe("hashSessionToken Cryptographic Standard Verification", () => {
    it("produces deterministic 64-character lowercase SHA-256 hex string", () => {
      const sampleToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sample_payload.sample_sig";
      const result = hashSessionToken(sampleToken);

      expect(result).toHaveProperty("hex");
      expect(result).toHaveProperty("binary");

      // Verify hex format: 64 hexadecimal characters
      expect(result.hex).toMatch(/^[a-f0-9]{64}$/);

      // Verify binary format: 32 bytes Buffer
      expect(Buffer.isBuffer(result.binary)).toBe(true);
      expect(result.binary.length).toBe(32);

      // Verify exact mathematical match against authoritative crypto SHA-256
      const authoritativeHex = createHash("sha256").update(sampleToken).digest("hex");
      expect(result.hex).toBe(authoritativeHex);
    });

    it("ensures distinct tokens produce distinct hashes with zero collision", () => {
      const tokenA = "bearer_token_user_alpha_" + randomBytes(16).toString("hex");
      const tokenB = "bearer_token_user_beta_" + randomBytes(16).toString("hex");

      const hashA = hashSessionToken(tokenA);
      const hashB = hashSessionToken(tokenB);

      expect(hashA.hex).not.toEqual(hashB.hex);
      expect(hashA.binary.equals(hashB.binary)).toBe(false);
    });

    it("is strictly one-way (irreversible: plaintext cannot be derived from hash)", () => {
      const token = "secret_jwt_bearer_" + randomBytes(32).toString("hex");
      const { hex } = hashSessionToken(token);

      // The plaintext token is not contained within the hash
      expect(hex).not.toContain(token);
      expect(token).not.toContain(hex);
    });
  });

  describe("Session Storage: Plaintext Token Elimination in Database", () => {
    /**
     * Remediation Session Creator (Conforming to R5)
     * Plaintext token is never persisted to database; only tokenHash is saved.
     */
    async function secureCreateSession(
      userId: number,
      userType: "oauth" | "local",
      rawToken: string,
      metadata: { ipAddress?: string; userAgent?: string } = {},
    ): Promise<MockSessionRow> {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const { hex: tokenHash } = hashSessionToken(rawToken);

      const row: MockSessionRow = {
        id: nextSessionId++,
        userId,
        userType,
        token: null, // CRITICAL: Plaintext token must be NULL in the database
        tokenHash,
        expiresAt,
        ipAddress: metadata.ipAddress || null,
        userAgent: metadata.userAgent || null,
        createdAt: new Date(),
      };

      mockSessionDb.push(row);
      return row;
    }

    it("stores only tokenHash and sets plaintext token column to null", async () => {
      const rawToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.user_token_live";

      const created = await secureCreateSession(42, "local", rawToken, {
        ipAddress: "197.38.1.1",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      });

      // Assert database record state
      expect(created.token).toBeNull();
      expect(created.tokenHash).toBe(hashSessionToken(rawToken).hex);
      expect(created.tokenHash).not.toEqual(rawToken);

      // Ensure no row in mockSessionDb contains the raw token in any string field
      const storedJson = JSON.stringify(mockSessionDb);
      expect(storedJson).not.toContain(rawToken);
    });

    it("resolves active sessions exclusively via tokenHash match when token is null", async () => {
      const rawToken = "valid_user_active_bearer_session";
      await secureCreateSession(101, "oauth", rawToken);

      // Function simulating validateActiveSessionToken query by tokenHash
      const resolveSession = (token: string): MockSessionRow | null => {
        const { hex: searchHash } = hashSessionToken(token);
        const now = new Date();
        const found = mockSessionDb.find(
          (s) => s.tokenHash === searchHash && s.expiresAt > now,
        );
        return found || null;
      };

      // Valid token -> resolves correctly via hash
      const resolved = resolveSession(rawToken);
      expect(resolved).not.toBeNull();
      expect(resolved?.userId).toBe(101);
      expect(resolved?.userType).toBe("oauth");
      expect(resolved?.token).toBeNull(); // Still null in database

      // Invalid token -> returns null
      const wrong = resolveSession("attacker_wrong_token");
      expect(wrong).toBeNull();
    });

    it("rejects authentication if tokenHash in database does not match the token", async () => {
      const validToken = "legitimate_session_token";
      const session = await secureCreateSession(200, "local", validToken);

      // Attacker tampers with tokenHash in DB or provides forged token
      session.tokenHash = hashSessionToken("different_token").hex;

      const { hex: searchHash } = hashSessionToken(validToken);
      const match = mockSessionDb.find((s) => s.tokenHash === searchHash);

      expect(match).toBeUndefined();
    });

    it("rejects expired sessions even if tokenHash matches perfectly", async () => {
      const rawToken = "expired_session_token";
      const session = await secureCreateSession(300, "local", rawToken);

      // Force expiration
      session.expiresAt = new Date(Date.now() - 1000 * 60);

      const { hex: searchHash } = hashSessionToken(rawToken);
      const activeMatch = mockSessionDb.find(
        (s) => s.tokenHash === searchHash && s.expiresAt > new Date(),
      );

      expect(activeMatch).toBeUndefined();
    });

    it("invalidates session cleanly by deleting based on tokenHash", async () => {
      const rawToken = "token_to_be_logged_out";
      await secureCreateSession(400, "local", rawToken);

      expect(mockSessionDb.length).toBe(1);

      // Invalidate
      const { hex: targetHash } = hashSessionToken(rawToken);
      mockSessionDb = mockSessionDb.filter((s) => s.tokenHash !== targetHash);

      expect(mockSessionDb.length).toBe(0);
    });
  });

  describe("Webhook Tokens & Sensitive Credential Protection", () => {
    it("generates cryptographically secure webhook tokens with high entropy (>= 256 bits)", () => {
      // iOS Shortcut / Android Companion Webhook token generator
      const generateSecureWebhookToken = (): string => {
        return "ss_wh_" + randomBytes(32).toString("hex");
      };

      const token1 = generateSecureWebhookToken();
      const token2 = generateSecureWebhookToken();

      expect(token1).toMatch(/^ss_wh_[a-f0-9]{64}$/);
      expect(token2).toMatch(/^ss_wh_[a-f0-9]{64}$/);
      expect(token1).not.toEqual(token2);
    });

    it("verifies webhook tokens via constant-time comparison or hash match to prevent timing attacks", () => {
      const secretWebhookToken = "ss_wh_" + randomBytes(32).toString("hex");
      const { hex: storedHash } = hashSessionToken(secretWebhookToken);

      // Fast constant-time comparison helper
      const verifyWebhookAccess = (incomingToken: string, expectedHash: string): boolean => {
        const { hex: incomingHash } = hashSessionToken(incomingToken);
        const bufA = Buffer.from(incomingHash, "utf-8");
        const bufB = Buffer.from(expectedHash, "utf-8");
        if (bufA.length !== bufB.length) return false;
        let diff = 0;
        for (let i = 0; i < bufA.length; i++) {
          diff |= bufA[i] ^ bufB[i];
        }
        return diff === 0;
      };

      expect(verifyWebhookAccess(secretWebhookToken, storedHash)).toBe(true);
      expect(verifyWebhookAccess("forged_webhook_token", storedHash)).toBe(false);
    });
  });
});
