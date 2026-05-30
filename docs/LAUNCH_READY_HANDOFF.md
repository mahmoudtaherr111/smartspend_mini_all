# Launch-Ready Handoff / تسليم جاهز للإطلاق

**Date:** 2026-05-21  
**Workspace:** `c:\Users\hp\.cursor\worktrees\smartspend_V1_fixed\4jwb`

---

## الملخص التنفيذي (عربي)

SmartSpend جاهز **للإطلاق التشغيلي** كمنتج ويب + PWA بعد ضبط متغيرات الإنتاج وPaymob. تم تنفيذ مسار دفع حقيقي (Paymob iframe + webhook)، تعزيز التصنيف لتقليل التوكنز، لوحة مؤسس أساسية، PWA محسّن، وتجربة موبايل على المسارات الحرجة. **الإيرادات تبدأ عند تفعيل مفاتيح Paymob على السيرفر** — بدونها الترقية في الإنتاج تظهر "الدفع غير متاح" (لا simulate خفي).

---

## Executive summary (English)

The codebase is **launch-capable** as a monolithic Hono + Vite/React deploy with Pro subscriptions via Paymob, Free/Pro AI classification tiers, admin ops metrics, and an installable PWA. This session added **real Paymob checkout wiring**, **production billing guards**, **classification cost optimizations (Phase 1–2 subset)**, **founder admin metrics**, and **launch documentation**. Run `npm run build` and configure `.env` per checklist before going live.

---

## ما تم إنجازه (DONE)

| Area                                                               | Status                    |
| ------------------------------------------------------------------ | ------------------------- |
| Part 1 Free AI routing                                             | Done (prior + maintained) |
| Part 2 Pro classifier, goals, image, reports                       | Done (prior sessions)     |
| Classification Phase 1 lazy embed + keyword priors + Pro L1 prompt | **Done this session**     |
| Paymob checkout API + webhook grant                                | **Done this session**     |
| Block simulate upgrade in production                               | Done                      |
| Pro page subscription status + no silent simulate                  | **Done this session**     |
| Admin founder metrics (DAU, Pro subs, tokens)                      | **Done this session**     |
| Support close ticket (admin)                                       | **Done this session**     |
| Per-user token cap (`admin.setUserTokenLimit`)                     | **Done this session**     |
| PWA sw.js v3 + install banner + offline.html                       | Done (prior + maintained) |
| Mobile bottom nav, safe-area, Pro responsive                       | Done                      |
| `.env.example`, `PRODUCTION_LAUNCH_CHECKLIST.md`                   | **Done this session**     |

---

## جزئي / يحتاج إعداد (PARTIAL)

| Item                                        | Workaround                                                |
| ------------------------------------------- | --------------------------------------------------------- |
| Paymob live keys                            | Use Paymob sandbox until keys on server; test one payment |
| Part 3 full dashboard redesign              | Use Admin tabs (dashboard, users, tickets, settings)      |
| `financial_goals` DB table                  | Run `npm run db:push`                                     |
| Ultra tier billing                          | Link only; manual admin plan if needed                    |
| Golden-set classification benchmarks        | Manual utterance tests in checklist                       |
| vite-plugin-pwa installed but **not wired** | Existing `public/sw.js` remains single PWA stack          |

---

## خطوات النشر (Deploy)

### 1. Environment

Copy `.env.example` → `.env` on server. Fill all required vars. See [`PRODUCTION_LAUNCH_CHECKLIST.md`](PRODUCTION_LAUNCH_CHECKLIST.md).

### 2. Database

```bash
npm run db:push
```

### 3. Build

```bash
npm install
npm run build
```

### 4. Run (monorepo)

```bash
NODE_ENV=production PORT=3000 node dist/boot.js
```

Serve behind **HTTPS** reverse proxy (nginx/Caddy) → `https://yourdomain.com`.

### 5. Paymob

- Dashboard → Webhook: `https://yourdomain.com/api/webhooks/paymob`
- Enable integration + iframe IDs in env
- Test 99 EGP monthly plan

### 6. Google OAuth

- Redirect URI: `https://yourdomain.com/api/auth/google/callback`

---

## تفعيل الأرباح (Payments)

1. **لا** تضع `BILLING_SIMULATE=true` في الإنتاج.
2. أضف `PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID`, `PAYMOB_IFRAME_ID`, `PAYMOB_HMAC_SECRET`.
3. المستخدم: صفحة **Pro** → "اشترك دلوقتي" → iframe Paymob.
4. بعد الدفع: webhook يفعّل `grantProSubscription` و`plan=pro`.
5. تحقق: Admin → founder metrics → Pro نشط / `listSubscriptionsAdmin`.

**بدون Paymob:** الترقية التلقائية **معطّلة** في الإنتاج (رسالة واضحة للمستخدم).

---

## مراقبة الأسبوع الأول

- **DAU / WAU:** Admin → الإحصائيات → founder row
- **إيراد:** Paymob reports + `pro_subscriptions` status=active
- **تكلفة AI:** `estimatedTokensUsed` + Gemini console
- **دعم:** open tickets count
- **جودة تصنيف:** `routing.reason` in logs — target more `high_confidence_rule_engine` / `skipped_strong_rule_precheck`

---

## مخاطر معروفة

1. أول دفعة Paymob حقيقية يجب أن تؤكد وصول `userId` في webhook extras.
2. Descriptor embedding cache — أول طلب بعد deploy قد يكون أبطأ.
3. لا يوجد commit في هذه الجلسة — انشر من الفرع الحالي بعد مراجعتك.

---

## ملفات أساسية تم تعديلها (هذه الجلسة)

- `api/lib/paymob.ts` — checkout flow
- `api/pro-router.ts` — billing modes
- `api/boot.ts` — webhook extras
- `api/lib/classification-pipeline.ts` — lazy embed, keyword priors
- `api/lib/keyword-category-priors.ts` — new
- `api/lib/ai-classifier-pro.ts` — tiered context
- `api/admin-router.ts` — founder metrics, token cap, subs list
- `src/pages/Pro.tsx`, `src/pages/Admin.tsx`
- `.env.example`, `docs/PRODUCTION_LAUNCH_CHECKLIST.md`, `docs/LAUNCH_READY_HANDOFF.md`

---

## Build / tests

Run locally:

```bash
npm install
npm run build
npx vitest run
```

Record pass/fail in your deploy log. Prior run: `ai-routing` 5/5 passed.

---

## مراجع

- [`REDEVELOPMENT_PART1_REPORT.md`](REDEVELOPMENT_PART1_REPORT.md)
- [`REDEVELOPMENT_PART2_REPORT.md`](REDEVELOPMENT_PART2_REPORT.md)
- [`CLASSIFICATION_UPGRADE_MASTER_PLAN.md`](CLASSIFICATION_UPGRADE_MASTER_PLAN.md)
