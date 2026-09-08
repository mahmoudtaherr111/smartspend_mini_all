import { describe, it, expect } from "vitest";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

/**
 * Security Suite R8: Security Boundaries, Magic Bytes & Schema Hardening
 * Covers:
 *  1. File upload magic bytes verification for receipt images (disguised malware rejection)
 *  2. Profile validation schema tightening (elimination of permissive z.any() wildcards)
 *  3. Mandatory verified OTP confirmation for phone number modifications
 */

// ============================================================================
// 1. Magic Bytes Image Validator Contract (SSoT for Receipt Processing)
// ============================================================================

export type MagicBytesResult = {
  valid: boolean;
  detectedMime?: string;
  error?: string;
};

export function validateImageMagicBytes(buffer: Buffer): MagicBytesResult {
  if (!buffer || buffer.length < 4) {
    return { valid: false, error: "الملف تالف أو فارغ" };
  }

  // Check JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, detectedMime: "image/jpeg" };
  }

  // Check PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, detectedMime: "image/png" };
  }

  // Check WebP: RIFF .... WEBP
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { valid: true, detectedMime: "image/webp" };
  }

  // Check GIF: GIF8
  if (buffer.length >= 6 && buffer.toString("ascii", 0, 4) === "GIF8") {
    return { valid: true, detectedMime: "image/gif" };
  }

  // Check HEIC / HEIF: ftypheic or ftypmif1 at offset 4
  if (buffer.length >= 12) {
    const brand = buffer.toString("ascii", 4, 12);
    if (brand.includes("ftyp") && (brand.includes("heic") || brand.includes("mif1"))) {
      return { valid: true, detectedMime: "image/heic" };
    }
  }

  return {
    valid: false,
    error: "نوع الملف غير مدعوم أو أن توقيع الملف (Magic Bytes) لا يطابق صورة حقيقية",
  };
}

/**
 * Receipt Ingestion Procedure Simulator with Magic Bytes Gate
 */
export async function processReceiptUpload(input: {
  imageBase64: string;
  claimedMimeType: string;
}) {
  const buffer = Buffer.from(input.imageBase64, "base64");
  const validation = validateImageMagicBytes(buffer);

  if (!validation.valid) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: validation.error || "تنسيق الصورة غير صالح",
    });
  }

  return {
    success: true,
    detectedMime: validation.detectedMime,
    byteSize: buffer.length,
  };
}

// ============================================================================
// 2. Strict Profile Validation Schemas (Eliminating z.any() wildcards)
// ============================================================================

export const StrictBasicInfoSchema = z
  .object({
    ageRange: z.enum(["18-24", "25-34", "35-44", "45-54", "55+"]).optional(),
    occupation: z.string().max(100).optional(),
    city: z.string().max(50).optional(),
    maritalStatus: z.enum(["single", "married", "prefer_not_to_say"]).optional(),
    dependentsCount: z.number().int().min(0).max(20).optional(),
  })
  .strict();

export const StrictFinancialInfoSchema = z
  .object({
    primaryIncomeSource: z.enum(["salary", "freelance", "business", "investments", "other"]).optional(),
    incomeBracket: z.string().max(50).optional(),
    primaryGoal: z.enum([
      "save_money",
      "reduce_spending",
      "pay_debt",
      "organize_expenses",
      "track_income",
      "manage_business",
    ]).optional(),
    hasEmergencyFund: z.boolean().optional(),
    budgetingExperience: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  })
  .strict();

export const StrictProfileUpdateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    phone: z.string().regex(/^01[0125]\d{8}$/, "رقم هاتف مصري غير صحيح").optional(),
    otpToken: z.string().min(6).max(64).optional(),
    avatar: z.string().max(200).optional(),
  })
  .refine(
    (data) => {
      // If phone number is being changed, otpToken MUST be supplied
      if (data.phone !== undefined) {
        return Boolean(data.otpToken && data.otpToken.trim().length > 0);
      }
      return true;
    },
    {
      message: "تغيير رقم الهاتف يتطلب تقديم رمز تأكيد التوثيق (OTP)",
      path: ["otpToken"],
    },
  );

describe("R8 Security: Security Boundaries, Magic Bytes & Schema Hardening", () => {
  describe("Receipt Image Upload Magic Bytes Verification", () => {
    it("accepts valid JPEG images starting with standard FF D8 FF signature", async () => {
      // Minimal valid JPEG header: FF D8 FF E0 00 10 4A 46 49 46 ...
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
      const base64 = jpegHeader.toString("base64");

      const result = await processReceiptUpload({
        imageBase64: base64,
        claimedMimeType: "image/jpeg",
      });

      expect(result.success).toBe(true);
      expect(result.detectedMime).toBe("image/jpeg");
    });

    it("accepts valid PNG images starting with standard 8-byte signature", async () => {
      // PNG header: 89 50 4E 47 0D 0A 1A 0A
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
      const base64 = pngHeader.toString("base64");

      const result = await processReceiptUpload({
        imageBase64: base64,
        claimedMimeType: "image/png",
      });

      expect(result.success).toBe(true);
      expect(result.detectedMime).toBe("image/png");
    });

    it("accepts valid WebP images with RIFF and WEBP markers", async () => {
      // WebP header: "RIFF" (4 bytes) + 4 bytes length + "WEBP" (4 bytes)
      const webpHeader = Buffer.from("RIFF\x20\x00\x00\x00WEBPVP8 ");
      const base64 = webpHeader.toString("base64");

      const result = await processReceiptUpload({
        imageBase64: base64,
        claimedMimeType: "image/webp",
      });

      expect(result.success).toBe(true);
      expect(result.detectedMime).toBe("image/webp");
    });

    it("rejects disguised Linux ELF executable binary (.so / bin disguised as image)", async () => {
      // ELF Magic Bytes: 7F 45 4C 46 (\x7fELF)
      const elfHeader = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
      const base64 = elfHeader.toString("base64");

      await expect(
        processReceiptUpload({
          imageBase64: base64,
          claimedMimeType: "image/jpeg",
        }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("rejects disguised Windows PE Executable (MZ header / .exe disguised as image)", async () => {
      // PE Magic Bytes: 4D 5A (MZ)
      const peHeader = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
      const base64 = peHeader.toString("base64");

      await expect(
        processReceiptUpload({
          imageBase64: base64,
          claimedMimeType: "image/png",
        }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("rejects disguised Shell script (#!) disguised as image", async () => {
      const scriptPayload = Buffer.from("#!/bin/bash\nrm -rf / --no-preserve-root\n");
      const base64 = scriptPayload.toString("base64");

      await expect(
        processReceiptUpload({
          imageBase64: base64,
          claimedMimeType: "image/jpeg",
        }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("rejects HTML / SVG script injection payload disguised as image", async () => {
      const htmlPayload = Buffer.from("<svg onload=alert(1)><script>steal()</script></svg>");
      const base64 = htmlPayload.toString("base64");

      await expect(
        processReceiptUpload({
          imageBase64: base64,
          claimedMimeType: "image/png",
        }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("rejects PDF document disguised as receipt image", async () => {
      // PDF Magic Bytes: %PDF-1.4
      const pdfHeader = Buffer.from("%PDF-1.4\n%âãÏÓ\n");
      const base64 = pdfHeader.toString("base64");

      await expect(
        processReceiptUpload({
          imageBase64: base64,
          claimedMimeType: "image/jpeg",
        }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("rejects truncated or zero-byte payloads (< 4 bytes)", async () => {
      const tinyBuffer = Buffer.from([0xff, 0xd8]); // Incomplete
      const base64 = tinyBuffer.toString("base64");

      await expect(
        processReceiptUpload({
          imageBase64: base64,
          claimedMimeType: "image/jpeg",
        }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });
  });

  describe("Strict Profile Validation Schemas (Eliminating z.any())", () => {
    it("accepts strictly typed valid basicInfo attributes", () => {
      const validBasic = {
        ageRange: "25-34" as const,
        city: "القاهرة",
        occupation: "مهندس برمجيات",
        dependentsCount: 2,
      };

      const parsed = StrictBasicInfoSchema.parse(validBasic);
      expect(parsed.ageRange).toBe("25-34");
      expect(parsed.city).toBe("القاهرة");
    });

    it("rejects unknown or arbitrary injected properties in basicInfo (.strict())", () => {
      const maliciousPayload = {
        ageRange: "25-34",
        city: "الجيزة",
        __proto__: { isAdmin: true },
        evilScript: "<script>alert(1)</script>",
        unexpectedField: 12345,
      };

      expect(() => StrictBasicInfoSchema.parse(maliciousPayload)).toThrow(z.ZodError);
    });

    it("accepts strictly typed valid financialInfo attributes", () => {
      const validFinancial = {
        primaryIncomeSource: "salary" as const,
        primaryGoal: "save_money" as const,
        hasEmergencyFund: true,
        budgetingExperience: "intermediate" as const,
      };

      const parsed = StrictFinancialInfoSchema.parse(validFinancial);
      expect(parsed.primaryGoal).toBe("save_money");
      expect(parsed.hasEmergencyFund).toBe(true);
    });

    it("rejects invalid enum values or malicious payloads in financialInfo", () => {
      const invalidFinancial = {
        primaryGoal: "arbitrary_attacker_goal_drop_tables",
      };

      expect(() => StrictFinancialInfoSchema.parse(invalidFinancial)).toThrow(z.ZodError);
    });
  });

  describe("Phone Number Modification OTP Verification Requirement", () => {
    it("allows name and avatar updates without requiring an OTP token", () => {
      const profileUpdate = {
        name: "أحمد طاهر الجديد",
        avatar: "avatar_04",
      };

      const parsed = StrictProfileUpdateSchema.parse(profileUpdate);
      expect(parsed.name).toBe("أحمد طاهر الجديد");
      expect(parsed.phone).toBeUndefined();
    });

    it("rejects phone number modification if otpToken is missing", () => {
      const phoneUpdateWithoutOtp = {
        phone: "01099887766",
        // otpToken omitted!
      };

      expect(() => StrictProfileUpdateSchema.parse(phoneUpdateWithoutOtp)).toThrow(z.ZodError);
    });

    it("rejects phone number modification if otpToken is empty string", () => {
      const phoneUpdateWithEmptyOtp = {
        phone: "01099887766",
        otpToken: "   ",
      };

      expect(() => StrictProfileUpdateSchema.parse(phoneUpdateWithEmptyOtp)).toThrow(z.ZodError);
    });

    it("allows phone number modification when valid Egyptian number and otpToken are supplied", () => {
      const validPhoneUpdate = {
        phone: "01099887766",
        otpToken: "verified_otp_grant_token_xyz123",
      };

      const parsed = StrictProfileUpdateSchema.parse(validPhoneUpdate);
      expect(parsed.phone).toBe("01099887766");
      expect(parsed.otpToken).toBe("verified_otp_grant_token_xyz123");
    });

    it("rejects non-Egyptian or malformed phone numbers regardless of OTP token", () => {
      const malformedPhone = {
        phone: "+12025550199", // US number
        otpToken: "valid_token",
      };

      expect(() => StrictProfileUpdateSchema.parse(malformedPhone)).toThrow(z.ZodError);
    });
  });
});
