/**
 * Image Magic Bytes Verification Utility
 * Security Boundary: R8 Receipt Image Validation
 *
 * Enforces binary signature validation on uploaded image payloads to prevent
 * disguised executables (ELF, PE, shell scripts, HTML/SVG XSS vectors) from
 * entering receipt processing pipelines.
 */

export type ImageFormat = "jpeg" | "png" | "webp";

export interface MagicBytesResult {
  valid: boolean;
  format?: ImageFormat;
  mime?: string;
  detectedMime?: string;
  error?: string;
}

/**
 * Validates binary signature (magic bytes) of an image buffer.
 * Permitted formats: JPEG, PNG, WebP.
 * Disguised executables (ELF, PE, Shell scripts, HTML, SVG, PDF) are strictly rejected.
 */
export function verifyImageMagicBytes(
  input: Buffer | Uint8Array,
): MagicBytesResult {
  if (!input || input.length < 4) {
    return {
      valid: false,
      error: "الملف تالف أو فارغ أو قصير جداً للتحقق من التوقيع الثنائي",
    };
  }

  const buf = Buffer.isBuffer(input)
    ? input
    : Buffer.from(input.buffer, input.byteOffset, input.byteLength);

  // ─── 1. Reject disguised executable / malicious file signatures ───

  // Linux ELF: 7F 45 4C 46 (\x7fELF)
  if (
    buf.length >= 4 &&
    buf[0] === 0x7f &&
    buf[1] === 0x45 &&
    buf[2] === 0x4c &&
    buf[3] === 0x46
  ) {
    return {
      valid: false,
      error: "تم رفض الملف: ملف تنفيذي غير مصرح به (Linux ELF Binary)",
    };
  }

  // Windows PE Executable (MZ header: 4D 5A)
  if (buf.length >= 2 && buf[0] === 0x4d && buf[1] === 0x5a) {
    return {
      valid: false,
      error: "تم رفض الملف: ملف تنفيذي غير مصرح به (Windows PE / MZ Executable)",
    };
  }

  // Shell script: #! (23 21)
  if (buf.length >= 2 && buf[0] === 0x23 && buf[1] === 0x21) {
    return {
      valid: false,
      error: "تم رفض الملف: سكربت تنفيذي غير مصرح به (Shell Script)",
    };
  }

  // PDF Document: %PDF- (25 50 44 46 2D)
  if (
    buf.length >= 5 &&
    buf[0] === 0x25 &&
    buf[1] === 0x50 &&
    buf[2] === 0x44 &&
    buf[3] === 0x46 &&
    buf[4] === 0x2d
  ) {
    return {
      valid: false,
      error: "تم رفض الملف: مستند PDF وليس صورة إيصال صالحة",
    };
  }

  // HTML / SVG / XML Injection Vectors: <html, <!DOCTYPE, <?xml, <svg, <script
  const headStr = buf.subarray(0, Math.min(buf.length, 64)).toString("ascii").toLowerCase().trimStart();
  if (
    headStr.startsWith("<html") ||
    headStr.startsWith("<!doctype") ||
    headStr.startsWith("<svg") ||
    headStr.startsWith("<script") ||
    headStr.startsWith("<?xml")
  ) {
    return {
      valid: false,
      error: "تم رفض الملف: محتوى نصي / HTML / SVG مشبوه",
    };
  }

  // ─── 2. Validate Allowed Image Signatures ───

  // JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return {
      valid: true,
      format: "jpeg",
      mime: "image/jpeg",
      detectedMime: "image/jpeg",
    };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return {
      valid: true,
      format: "png",
      mime: "image/png",
      detectedMime: "image/png",
    };
  }

  // WebP: RIFF (bytes 0-3) + WEBP (bytes 8-11)
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && // 'R'
    buf[1] === 0x49 && // 'I'
    buf[2] === 0x46 && // 'F'
    buf[3] === 0x46 && // 'F'
    buf[8] === 0x57 && // 'W'
    buf[9] === 0x45 && // 'E'
    buf[10] === 0x42 && // 'B'
    buf[11] === 0x50 // 'P'
  ) {
    return {
      valid: true,
      format: "webp",
      mime: "image/webp",
      detectedMime: "image/webp",
    };
  }

  return {
    valid: false,
    error: "نوع الملف غير مدعوم أو أن توقيع الملف (Magic Bytes) لا يطابق صورة حقيقية. الأنواع المسموحة هي JPEG و PNG و WebP فقط.",
  };
}

/**
 * Compatible alias matching the R8 test oracle contract.
 */
export const validateImageMagicBytes = verifyImageMagicBytes;
