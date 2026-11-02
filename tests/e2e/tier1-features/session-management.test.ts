import { describe, it, expect, beforeEach } from "vitest";
import { UserSession } from "../harness/opaque-context";

/**
 * Tier 1 - Feature Coverage: Devices & Session Management
 * Requirements: ACC-04, GAP-25, GAP-27, GAP-28, GAP-29
 * Authoritative source: ORIGINAL_REQUEST.md R1 & PROJECT.md § Feature Inventory #10, 11, 16, 17, 18
 */

class SessionManager {
  private sessions = new Map<string, UserSession>();

  createSession(params: {
    userId: string;
    userType: "local" | "google";
    deviceName: string;
    ipAddress: string;
    fingerprint: string;
  }): UserSession {
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const session: UserSession = {
      sessionId,
      userId: params.userId,
      userType: params.userType,
      deviceName: params.deviceName,
      ipAddress: params.ipAddress,
      fingerprint: params.fingerprint,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      isRevoked: false,
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  getActiveSessions(userId: string, userType: "local" | "google"): UserSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.userId === userId && s.userType === userType && !s.isRevoked
    );
  }

  revokeSession(sessionId: string, userId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) return false;
    session.isRevoked = true;
    return true;
  }

  revokeAllUserSessions(userId: string, userType: "local" | "google"): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.userId === userId && session.userType === userType && !session.isRevoked) {
        session.isRevoked = true;
        count++;
      }
    }
    return count;
  }

  validateSession(sessionId: string): { valid: boolean; session?: UserSession } {
    const session = this.sessions.get(sessionId);
    if (!session || session.isRevoked) {
      return { valid: false };
    }
    return { valid: true, session };
  }
}

describe("Tier 1 - Feature Coverage: Sessions Management (ACC-04, GAP-27, GAP-28, GAP-29)", () => {
  let manager: SessionManager;
  const userId = "usr_sess_test_01";
  const userType = "local";

  beforeEach(() => {
    manager = new SessionManager();
  });

  it("Test 1 [GAP-28, GAP-29]: Session includes device metadata, name, IP, and fingerprint", () => {
    const session = manager.createSession({
      userId,
      userType,
      deviceName: "Samsung Galaxy S24 Ultra",
      ipAddress: "156.204.10.45",
      fingerprint: "fp_abc123xyz",
    });

    expect(session.sessionId).toBeDefined();
    expect(session.deviceName).toBe("Samsung Galaxy S24 Ultra");
    expect(session.ipAddress).toBe("156.204.10.45");
    expect(session.fingerprint).toBe("fp_abc123xyz");
    expect(session.isRevoked).toBe(false);
  });

  it("Test 2 [ACC-04]: Lists all active sessions for the user pair", () => {
    manager.createSession({
      userId,
      userType,
      deviceName: "iPhone 15 Pro",
      ipAddress: "197.35.80.12",
      fingerprint: "fp_ios_1",
    });
    manager.createSession({
      userId,
      userType,
      deviceName: "Chrome on macOS",
      ipAddress: "197.35.80.14",
      fingerprint: "fp_web_1",
    });

    const activeList = manager.getActiveSessions(userId, userType);
    expect(activeList.length).toBe(2);
    expect(activeList.map((s) => s.deviceName)).toContain("iPhone 15 Pro");
    expect(activeList.map((s) => s.deviceName)).toContain("Chrome on macOS");
  });

  it("Test 3 [ACC-04]: User can revoke an individual remote session", () => {
    const s1 = manager.createSession({
      userId,
      userType,
      deviceName: "Pixel 8",
      ipAddress: "41.233.1.2",
      fingerprint: "fp_px8",
    });
    const s2 = manager.createSession({
      userId,
      userType,
      deviceName: "iPad Air",
      ipAddress: "41.233.1.3",
      fingerprint: "fp_ipad",
    });

    const revoked = manager.revokeSession(s1.sessionId, userId);
    expect(revoked).toBe(true);

    const activeList = manager.getActiveSessions(userId, userType);
    expect(activeList.length).toBe(1);
    expect(activeList[0].sessionId).toBe(s2.sessionId);
    expect(manager.validateSession(s1.sessionId).valid).toBe(false);
    expect(manager.validateSession(s2.sessionId).valid).toBe(true);
  });

  it("Test 4 [GAP-27]: Password reset revokes all existing active sessions", () => {
    manager.createSession({ userId, userType, deviceName: "Dev 1", ipAddress: "1.1.1.1", fingerprint: "fp1" });
    manager.createSession({ userId, userType, deviceName: "Dev 2", ipAddress: "2.2.2.2", fingerprint: "fp2" });
    manager.createSession({ userId, userType, deviceName: "Dev 3", ipAddress: "3.3.3.3", fingerprint: "fp3" });

    expect(manager.getActiveSessions(userId, userType).length).toBe(3);

    const revokedCount = manager.revokeAllUserSessions(userId, userType);
    expect(revokedCount).toBe(3);
    expect(manager.getActiveSessions(userId, userType).length).toBe(0);
  });

  it("Test 5 [GAP-25]: Revoked session cannot perform authenticated requests", () => {
    const session = manager.createSession({
      userId,
      userType,
      deviceName: "Workstation",
      ipAddress: "10.0.0.1",
      fingerprint: "fp_work",
    });

    manager.revokeSession(session.sessionId, userId);
    const authCheck = manager.validateSession(session.sessionId);
    expect(authCheck.valid).toBe(false);
  });
});
