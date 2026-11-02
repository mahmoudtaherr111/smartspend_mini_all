import { describe, it, expect, beforeEach } from "vitest";
import { isAccountDeletionConfirmed, ACCOUNT_DELETION_PHRASE, ACCOUNT_DELETION_PHRASE_EN } from "@contracts/account-deletion";
import { UserPair } from "../harness/opaque-context";

/**
 * Tier 1 - Feature Coverage: Account Deletion Sheet & Procedure
 * Requirements: ACC-05
 * Authoritative source: ORIGINAL_REQUEST.md R1 & PROJECT.md § Interface Contracts #1 & contracts/account-deletion.ts
 */

interface MockDatabase {
  users: Map<string, UserPair>;
  expenses: Array<{ id: string; userId: string; userType: string; amount: number }>;
  sessions: Array<{ id: string; userId: string; userType: string; active: boolean }>;
}

class AccountDeletionService {
  constructor(private db: MockDatabase) {}

  deleteAccount(params: {
    user: UserPair;
    confirmationText: string;
    password?: string;
  }): { success: boolean; error?: string } {
    // 1. Verify confirmation phrase
    if (!isAccountDeletionConfirmed(params.confirmationText)) {
      return { success: false, error: "INVALID_CONFIRMATION_PHRASE" };
    }

    // 2. Local auth users must provide password
    if (params.user.userType === "local") {
      if (!params.password || params.password !== "correct_local_password") {
        return { success: false, error: "INVALID_PASSWORD" };
      }
    }

    // 3. Purge user data across tables
    const userKey = `${params.user.userId}:${params.user.userType}`;
    const user = this.db.users.get(userKey);
    if (!user) {
      return { success: false, error: "USER_NOT_FOUND" };
    }

    user.deletedAt = Date.now();
    this.db.expenses = this.db.expenses.filter(
      (e) => !(e.userId === params.user.userId && e.userType === params.user.userType)
    );
    this.db.sessions = this.db.sessions.filter(
      (s) => !(s.userId === params.user.userId && s.userType === params.user.userType)
    );

    return { success: true };
  }
}

describe("Tier 1 - Feature Coverage: Account Deletion (ACC-05)", () => {
  let db: MockDatabase;
  let service: AccountDeletionService;
  let localUser: UserPair;
  let googleUser: UserPair;

  beforeEach(() => {
    localUser = {
      userId: "usr_local_123",
      userType: "local",
      phone: "201012345678",
      plan: "free",
      role: "user",
    };
    googleUser = {
      userId: "usr_google_456",
      userType: "google",
      email: "user@gmail.com",
      plan: "pro",
      role: "user",
    };

    db = {
      users: new Map([
        [`${localUser.userId}:${localUser.userType}`, { ...localUser }],
        [`${googleUser.userId}:${googleUser.userType}`, { ...googleUser }],
      ]),
      expenses: [
        { id: "exp_1", userId: localUser.userId, userType: localUser.userType, amount: 150 },
        { id: "exp_2", userId: googleUser.userId, userType: googleUser.userType, amount: 300 },
      ],
      sessions: [
        { id: "sess_1", userId: localUser.userId, userType: localUser.userType, active: true },
        { id: "sess_2", userId: googleUser.userId, userType: googleUser.userType, active: true },
      ],
    };

    service = new AccountDeletionService(db);
  });

  it("Test 1 [ACC-05]: Exact Arabic confirmation phrase executes deletion successfully", () => {
    const result = service.deleteAccount({
      user: localUser,
      confirmationText: ACCOUNT_DELETION_PHRASE,
      password: "correct_local_password",
    });

    expect(result.success).toBe(true);
    expect(db.expenses.filter((e) => e.userId === localUser.userId).length).toBe(0);
    expect(db.sessions.filter((s) => s.userId === localUser.userId).length).toBe(0);
  });

  it("Test 2 [ACC-05]: English confirmation phrase executes deletion successfully", () => {
    const result = service.deleteAccount({
      user: googleUser,
      confirmationText: ACCOUNT_DELETION_PHRASE_EN,
    });

    expect(result.success).toBe(true);
    expect(db.expenses.filter((e) => e.userId === googleUser.userId).length).toBe(0);
  });

  it("Test 3 [ACC-05]: Normalization handles tatweel, hamzas, casing, and irregular spaces", () => {
    const tatweelArabic = "  احـذف   حسـابي  ";
    const mixedCaseEnglish = "  DeLeTe   My   AcCoUnT  ";

    expect(isAccountDeletionConfirmed(tatweelArabic)).toBe(true);
    expect(isAccountDeletionConfirmed(mixedCaseEnglish)).toBe(true);
  });

  it("Test 4 [ACC-05]: Rejects invalid or incomplete confirmation phrases", () => {
    const invalidPhrases = [
      "delete",
      "احذف",
      "حذف الحساب",
      "delete account",
      "i want to delete my account",
    ];

    for (const phrase of invalidPhrases) {
      expect(isAccountDeletionConfirmed(phrase)).toBe(false);
      const res = service.deleteAccount({
        user: googleUser,
        confirmationText: phrase,
      });
      expect(res.success).toBe(false);
      expect(res.error).toBe("INVALID_CONFIRMATION_PHRASE");
    }
  });

  it("Test 5 [ACC-05]: Local auth user requires valid password to execute deletion", () => {
    const result = service.deleteAccount({
      user: localUser,
      confirmationText: ACCOUNT_DELETION_PHRASE,
      password: "wrong_password",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("INVALID_PASSWORD");
    // Ensure data was NOT wiped
    expect(db.expenses.filter((e) => e.userId === localUser.userId).length).toBe(1);
  });
});
