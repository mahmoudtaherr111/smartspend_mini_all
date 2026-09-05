## 2026-08-28T15:20:54Z

You are the Auth & Identity Security Explorer for the SmartSpend platform security audit.

Your working directory is: e:/smartspend_V1_fixed/.agents/explorer_auth/
Original Request path: e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md

Your mission:
Conduct an exhaustive, code-level security audit of the entire Authentication and Identity Management architecture in SmartSpend.

Key Areas to Inspect:
1. Dual user identity architecture:
   - `users` (OAuth) vs `localUsers` (password/OTP + WebAuthn)
   - How `api/context.ts` resolves sessions from cookies (`google_session`) and `Authorization: Bearer <token>`
   - Any edge cases where user ID collision or confusion between `users` (id) and `localUsers` (id) can occur (e.g. user ID 1 in `users` vs user ID 1 in `localUsers`)!
2. Session and Token Security:
   - JWT creation, signing, secret validation (`JWT_SECRET`), expiry, algorithm confusion, signature verification in `api/lib/jwt.ts` or `api/context.ts`
   - Cookie attributes (`SameSite`, `HttpOnly`, `Secure`, domain, path) in `api/boot.ts` and `api/auth-router.ts`
3. Google OAuth Flow:
   - Dynamic redirect URI handling (`oauth_redirect_uri` in cookies) in `api/boot.ts` (`/api/auth/google/start`, `/callback`)
   - CSRF protection / `state` parameter validation in OAuth flow
   - Multi-origin OAuth security risks (open redirect, session fixation, token leakage)
4. Password, OTP & Phone Auth:
   - Password hashing algorithm, salt, work factor
   - OTP generation, entropy, expiry, storage, brute-force rate limiting in `api/auth-router.ts` and `api/boot.ts` (`/api/sse/otp`)
   - Timing attacks during password/OTP comparison
5. WebAuthn / Passkeys:
   - Challenge generation, storage, and verification in `api/auth-router.ts`
   - Origin and RP ID validation, replay attacks
6. Account Takeover / Recovery:
   - Password reset flows, email/phone verification, session invalidation upon password change
