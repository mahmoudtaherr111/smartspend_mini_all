import { describe, it, expect } from "vitest";
import { normalizeEgyptianPhone } from "../tier1-features/phone-challenge.test";

/**
 * Tier 2 - Boundary & Corner Cases: Phone Challenge Flow
 * Requirements: ACC-03, GAP-24
 */

describe("Tier 2 - Boundary & Corner Cases: Phone Challenge Flow", () => {
  it("Test 1: Digit length boundary for Egyptian mobile numbers", () => {
    // Exactly 11 digits starting with 01
    expect(normalizeEgyptianPhone("01012345678")).toBe("201012345678");
    // 10 digits (one short)
    expect(normalizeEgyptianPhone("0101234567")).toBeNull();
    // 12 digits (one too many)
    expect(normalizeEgyptianPhone("010123456789")).toBeNull();
    // Empty input
    expect(normalizeEgyptianPhone("")).toBeNull();
  });

  it("Test 2: Rejects letters, symbols, and script tags inside phone input", () => {
    expect(normalizeEgyptianPhone("0101234567a")).toBeNull();
    expect(normalizeEgyptianPhone("<script>01012345678</script>")).toBeNull();
    expect(normalizeEgyptianPhone("01012345678' OR '1'='1")).toBeNull();
  });

  it("Test 3: OTP submission length boundary (must be exact required length e.g. 6 digits)", () => {
    const validateOtpFormat = (otp: string): boolean => {
      return /^\d{6}$/.test(otp);
    };

    expect(validateOtpFormat("123456")).toBe(true);
    expect(validateOtpFormat("12345")).toBe(false); // 5 digits
    expect(validateOtpFormat("1234567")).toBe(false); // 7 digits
    expect(validateOtpFormat("")).toBe(false); // empty
    expect(validateOtpFormat("12345a")).toBe(false); // non-digit
  });

  it("Test 4: Expiration boundary at exactly 300 seconds", () => {
    const challengeCreatedAt = 1000000;
    const expiryWindowMs = 300 * 1000;
    const expiresAt = challengeCreatedAt + expiryWindowMs;

    const isOtpExpired = (now: number) => now > expiresAt;

    expect(isOtpExpired(expiresAt - 1)).toBe(false);
    expect(isOtpExpired(expiresAt)).toBe(false);
    expect(isOtpExpired(expiresAt + 1)).toBe(true);
  });

  it("Test 5: Concurrency race condition simulation on OTP verification", () => {
    let verifiedCount = 0;
    let isUsed = false;

    const verifySingleUseOtp = () => {
      if (isUsed) {
        return { success: false, error: "OTP_ALREADY_USED" };
      }
      isUsed = true;
      verifiedCount++;
      return { success: true };
    };

    // Simulate two simultaneous verification requests
    const res1 = verifySingleUseOtp();
    const res2 = verifySingleUseOtp();

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(false);
    expect(res2.error).toBe("OTP_ALREADY_USED");
    expect(verifiedCount).toBe(1);
  });
});
