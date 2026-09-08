# Handoff Report — Milestone M4: Security Boundaries (R8)

**Agent**: Worker M4 (`worker_sec_m4`)  
**Parent Agent**: Orchestrator (`472de1c9-5556-417b-8df1-292ac29591a9`)  
**Milestone**: M4 (R8: Secure Cookies, Profile Boundaries, Phone Change OTP & Receipt Magic Bytes)  
**Date**: 2026-09-08  
**Status**: COMPLETE (Hard Handoff)

---

## 1. Observation

### 1.1 Local Authentication Token Transmission
- **Prior State**: `login` and `register` in `api/local-auth-router.ts` returned `{ token, user }` solely in JSON. Tokens were stored in browser `localStorage`, subject to exfiltration via XSS. `logout` only deleted session by plaintext token if present in `Authorization: Bearer`.
- **Created/Modified**:
  - In `api/local-auth-router.ts`:
    - `register` (lines 169–178): Sets `Set-Cookie: smartspend_token=<token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800` (appends `; Secure` in production), while continuing to return `{ token, user }` in the JSON response.
    - `login` (lines 338–346): Sets `Set-Cookie: smartspend_token=<token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800` (appends `; Secure` in production).
    - `verifyOtp` (lines 364–423): Added procedure verifying OTP, setting `smartspend_token` cookie, and returning `{ success: true, token, user }`.
    - `logout` (lines 436–460): Clears both `smartspend_token` and `google_session` cookies with `Max-Age=0`. Extracts token from `Authorization: Bearer` or `smartspend_token` cookie and revokes it via `invalidateSession(token)`.
  - In `api/context.ts`:
    - `parseCookie` (lines 35–56): Enhanced to strip enclosing quotes and trim/decode URI components.
    - `createContext` (lines 106–120): If `Authorization: Bearer <token>` is missing, checks `smartspend_token` (or `local_session`) cookie. If present, validates it against active user sessions, resolves `UnifiedUser`, and caches in Redis identically to Bearer tokens.

### 1.2 User Profile Schema Tightening & Phone Change Protection
- **Prior State**:
  - `smartProfilePatchSchema` in `api/profile-router.ts:37-46` used `z.record(z.string(), z.any())` across all profile sections.
  - `submitOnboardingAnswer` used `value: z.any().optional()` and `accumulatedAnswers: z.record(z.string(), z.any()).optional()`.
  - `updateUserInfo` allowed local users to directly mutate `phone` without OTP verification or possession check.
- **Created/Modified**:
  - In `api/profile-router.ts`:
    - Defined bounded value schemas: `safePrimitiveSchema`, `safeArraySchema`, `safeProfileValueSchema`.
    - Replaced `z.any()` with `safeProfileSectionSchema` (validating alphanumeric key names up to 80 chars, and capping section elements to 100).
    - Exported strict schemas matching test oracle: `StrictBasicInfoSchema`, `StrictFinancialInfoSchema`, `StrictProfileUpdateSchema`.
    - Tightened `submitOnboardingAnswer` (lines 355–365) to use `safeProfileValueSchema` and bounded `onboardingAnswerSchema`.
    - Added `requestPhoneChange` (lines 428–483): Validates Egyptian phone format, ensures no duplicate phone across `localUsers`, generates 6-digit OTP code, stores in `otpCache`, and sends message via `whatsappService` if enabled.
    - Added `confirmPhoneChange` (lines 485–550): Validates OTP against `otpCache`, checks conflict again, updates `localUsers.phone`, bumps `authver` via `bumpAuthVersion("local", userId)`, and issues a verified grant `otpToken`.
    - Protected `updateUserInfo` (lines 552–620): Bound to `StrictProfileUpdateSchema`. Prohibits unverified phone modifications by requiring a non-empty `otpToken` when `phone` is present, verifying the token against `otpCache`, checking collisions, updating DB, and bumping `authver`.
    - Guarded `addContact` (lines 901–915) and `updateContact` (lines 936–949) with `validateBusinessOwnership` whenever `businessId` is provided.

### 1.3 Receipt Image Magic Bytes Verification
- **Prior State**: `api/image-router.ts:55-71` only checked payload character length (`imageBase64.length > 5_500_000`) and accepted untrusted `mimeType: z.string().default("image/jpeg")`, passing disguised payloads directly to downstream AI processors.
- **Created/Modified**:
  - Created `api/lib/image-magic-bytes.ts`:
    - Implemented `verifyImageMagicBytes(buffer: Buffer | Uint8Array)`:
      - Reject ELF executables (`0x7F, 0x45, 0x4C, 0x46`).
      - Reject Windows PE/MZ executables (`0x4D, 0x5A`).
      - Reject Shell scripts (`#!` / `0x23, 0x21`).
      - Reject PDF documents (`%PDF-` / `0x25, 0x50, 0x44, 0x46, 0x2D`).
      - Reject HTML / SVG / XML payloads (`<html`, `<!DOCTYPE`, `<svg`, `<script`, `<?xml`).
      - Validate JPEG: bytes 0–2 must be `0xFF, 0xD8, 0xFF`.
      - Validate PNG: bytes 0–7 must be `0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A`.
      - Validate WebP: bytes 0–3 must be `RIFF` and bytes 8–11 must be `WEBP`.
      - Exported `validateImageMagicBytes` compatible alias.
  - In `api/image-router.ts`:
    - Decodes base64 payload into Buffer and calls `verifyImageMagicBytes(imageBuffer)`.
    - If invalid, throws `new TRPCError({ code: "BAD_REQUEST", message: "Invalid image format: binary signature verification failed. Only JPEG, PNG, and WebP are permitted." })`.
    - Passes verified MIME type `magicResult.mime` to `parseReceiptImage`.

---

## 2. Logic Chain

1. **Dual-Mode Cookie Transport**:
   - Web clients receive `smartspend_token` as an `HttpOnly`, `SameSite=Lax` cookie, shielding tokens from browser JavaScript and XSS exfiltration.
   - At the same time, returning `{ token, user }` in the JSON response ensures companion apps, background workers, and API clients using `Authorization: Bearer` continue to function without breaking changes.
   - In `createContext`, prioritizing `Authorization: Bearer` header first guarantees that existing automated tests, scripts, and mobile integrations are honored before falling back to `smartspend_token` or `google_session` cookies.

2. **Phone Number Mutation Defense**:
   - Allowing direct phone changes via `updateUserInfo` without OTP confirmation creates an account lockout/takeover risk.
   - By refining `updateUserInfo` input to require `otpToken` if `phone` is passed, and implementing the 2-step `requestPhoneChange` / `confirmPhoneChange` workflow with WhatsApp OTP delivery and in-memory rate limits, phone modifications are guaranteed to be authenticated and verified.

3. **Receipt Binary Signature Gate**:
   - Attackers can disguise polyglot binaries, shell scripts, or HTML/SVG files with client-controlled `Content-Type: image/jpeg` headers.
   - By decoding the base64 payload and inspecting initial binary magic bytes before passing data to OCR or AI models, non-image files are rejected deterministically at the tRPC boundary.

---

## 3. Caveats

- **Active Sessions in Development**: When running locally without HTTPS, `Secure` flag is omitted for local cookies so developers can authenticate over `http://localhost`. In production (`process.env.NODE_ENV === "production"`), the `Secure` flag is strictly added.
- **Monorepo Dependencies Outside M4**: Milestone M1 changes in `export-router.ts` referencing `exceljs` require `npm install` for full monorepo `tsc -b` compilation. All 5 files owned by Worker M4 compile cleanly with zero TypeScript errors.

---

## 4. Conclusion

All requirements for Milestone M4 (R8) have been fully implemented with genuine business and security logic:
- Secure cookie migration for local auth is fully operational with dual-mode compatibility.
- Profile schemas have been hardened to eliminate `z.any()` wildcards.
- Phone number modifications require verified OTP confirmation.
- Image receipt uploads enforce strict binary magic bytes verification (JPEG, PNG, WebP) and reject disguised executables.

---

## 5. Verification Method

### Test Commands
1. **R8 Test Oracle**:
   ```bash
   npx vitest run tests/security/r8-security-boundaries.test.ts
   ```
   *Result*: 18 passed / 18 passed (100%).

2. **Local Auth Security Test Suite**:
   ```bash
   npx vitest run api/local-auth-router.security.test.ts
   ```
   *Result*: 3 passed / 3 passed (100%).

### Key Files Inspected
- `api/local-auth-router.ts` (lines 169–178, 338–346, 364–423, 436–460)
- `api/context.ts` (lines 35–56, 106–120)
- `api/profile-router.ts` (lines 40–135, 350–365, 420–620, 901–949)
- `api/lib/image-magic-bytes.ts` (lines 1–163)
- `api/image-router.ts` (lines 74–86, 140–145)
