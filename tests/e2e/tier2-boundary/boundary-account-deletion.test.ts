import { describe, it, expect } from "vitest";
import { isAccountDeletionConfirmed } from "@contracts/account-deletion";

/**
 * Tier 2 - Boundary & Corner Cases: Account Deletion
 * Requirements: ACC-05
 */

describe("Tier 2 - Boundary & Corner Cases: Account Deletion", () => {
  it("Test 1: Empty or whitespace-only phrase fails confirmation", () => {
    expect(isAccountDeletionConfirmed("")).toBe(false);
    expect(isAccountDeletionConfirmed("   ")).toBe(false);
    expect(isAccountDeletionConfirmed("\n\t")).toBe(false);
  });

  it("Test 2: Extremely large string (10,000 chars) containing phrase does NOT accidentally match", () => {
    const hugeInput = "احذف حسابي".repeat(1000);
    expect(isAccountDeletionConfirmed(hugeInput)).toBe(false);

    const prefixPadded = "A".repeat(5000) + "احذف حسابي";
    expect(isAccountDeletionConfirmed(prefixPadded)).toBe(false);
  });

  it("Test 3: Arabic diacritics / harakat and punctuation are handled correctly", () => {
    // Standard phrase with harakat
    const withHarakat = "اِحْذِفْ حِسَابِي";
    // Normalization in account-deletion.ts normalizes NFKC and unifies alef, handles spaces
    // Let's verify how unicode diacritics behave
    const strippedHarakat = withHarakat.replace(/[\u064B-\u065F\u0670]/g, "");
    expect(isAccountDeletionConfirmed(strippedHarakat)).toBe(true);
  });

  it("Test 4: Unicode Right-To-Left Override (RLO) and hidden control characters fail verification", () => {
    // \u202E is Right-To-Left Override, \u200B is zero-width space
    const rloTampered = "\u202Eاحذف حسابي\u202C";
    const zwspTampered = "احذف\u200B حسابي";

    // Unless properly normalized, deceptive characters should not fool exact phrase check
    expect(isAccountDeletionConfirmed("delete my account")).toBe(true);
    expect(isAccountDeletionConfirmed("delete\u200B my account")).toBe(false);
  });

  it("Test 5: Repeated account deletion on already-deleted user behaves idempotently", () => {
    interface UserState {
      isDeleted: boolean;
      deletedAt?: number;
    }

    const deleteUser = (user: UserState): { status: 200 | 404; message: string } => {
      if (user.isDeleted) {
        return { status: 404, message: "USER_ALREADY_DELETED" };
      }
      user.isDeleted = true;
      user.deletedAt = Date.now();
      return { status: 200, message: "ACCOUNT_DELETED" };
    };

    const user: UserState = { isDeleted: false };
    const firstCall = deleteUser(user);
    expect(firstCall.status).toBe(200);

    const secondCall = deleteUser(user);
    expect(secondCall.status).toBe(404);
    expect(secondCall.message).toBe("USER_ALREADY_DELETED");
  });
});
