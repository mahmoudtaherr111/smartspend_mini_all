## 2026-09-08T05:23:17Z
You are Worker M4 for the SmartSpend AI enterprise-grade security remediation project.

Your Identity & Working Directory:
- Role: Security Implementation Worker (Milestone M4: R8)
- Working Directory: e:/smartspend_V1_fixed/.agents/worker_sec_m4/
- Project Root: e:/smartspend_V1_fixed
- Authoritative Request: e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md (MANDATORY: READ THIS FIRST!)
- Project Scope: e:/smartspend_V1_fixed/.agents/PROJECT.md
- Survey Report to read:
  - e:/smartspend_V1_fixed/.agents/explorer_sec_r5_r6_r8/report.md and handoff.md
- Test Oracle:
  - `tests/security/r8-security-boundaries.test.ts`
- Rules: Follow AGENTS.md in project root. Note Gotcha #1: User identity & session cookies vs Bearer token.

Your Exclusive File Ownership:
- `api/local-auth-router.ts`
- `api/context.ts`
- `api/profile-router.ts`
- `api/lib/image-magic-bytes.ts`
- `api/image-router.ts`

Your Tasks:
1. R8 (Secure Cookie Migration for Local Auth):
   - In `api/local-auth-router.ts`:
     - In `login` and `verifyOtp`: on successful authentication, set an `HttpOnly`, `Secure` (when `process.env.NODE_ENV === 'production'`), `SameSite=lax`, `Path=/` cookie named `smartspend_token` (or `local_session`) containing the auth token, while continuing to return `{ token, user }` in the JSON response for backward compatibility with mobile/companion apps.
     - In `logout`: clear the `smartspend_token` cookie.
   - In `api/context.ts`:
     - In `createContext`: if the `Authorization: Bearer <token>` header is missing, check `getCookie(c, 'smartspend_token')` or the `Cookie` header for the local auth token. If present, validate it against local user sessions just like a bearer token.

2. R8 (Schema Boundaries & Phone Change OTP Confirmation):
   - In `api/profile-router.ts`:
     - Eliminate any permissive `z.record(z.string(), z.any())` or `z.any()` wildcards in profile inputs. Replace with strict, bounded schemas.
     - Protect phone number changes: require verified OTP confirmation before modifying `localUsers.phone` (e.g. `requestPhoneChange` issuing an OTP, and `confirmPhoneChange` verifying OTP before persisting the phone update). Direct unverified phone modification must be prohibited.

3. R8 (Receipt Image Magic Bytes Verification):
   - Create `api/lib/image-magic-bytes.ts`:
     - Implement `verifyImageMagicBytes(buffer: Buffer | Uint8Array): { valid: boolean; format?: "jpeg" | "png" | "webp"; mime?: string; error?: string }`:
       - JPEG: bytes 0–2 must be `0xFF, 0xD8, 0xFF`
       - PNG: bytes 0–7 must be `0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A`
       - WebP: bytes 0–3 must be `RIFF` (`0x52, 0x49, 0x46, 0x46`) and bytes 8–11 must be `WEBP` (`0x57, 0x45, 0x42, 0x50`)
       - Reject disguised executable files: ELF (`0x7F, 0x45, 0x4C, 0x46`), PE/MZ (`0x4D, 0x5A`), shell scripts (`#!`), HTML (`<html`, `<!DOCTYPE`), or SVG.
   - In `api/image-router.ts` (in `parseReceipt` or receipt image processing):
     - Decode base64 image data into a Buffer.
     - Call `verifyImageMagicBytes(buffer)`. If invalid, throw `new TRPCError({ code: "BAD_REQUEST", message: "Invalid image format: binary signature verification failed. Only JPEG, PNG, and WebP are permitted." })`.

4. Verification:
   - Verify alignment with `tests/security/r8-security-boundaries.test.ts`.
5. Output Deliverables:
   - Write handoff report to `e:/smartspend_V1_fixed/.agents/worker_sec_m4/handoff.md`.
   - Send completion message to orchestrator.
