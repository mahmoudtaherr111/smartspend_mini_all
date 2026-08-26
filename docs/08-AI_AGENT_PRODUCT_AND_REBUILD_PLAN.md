# SmartSpend AI — Product & Agent Rebuild Contract

> **Status:** Active production blueprint and product contract for the AI Center, financial data layer, and native PWA experience.

---

## 1. 🎯 Product Mission & Egyptian User Jobs

SmartSpend AI is an intelligent behavioral financial platform built specifically for Arabic speakers and Egyptian financial workflows (EGP, local banks, Vodafone Cash, InstaPay, and colloquial Egyptian dialect classification).

Success means the user can interact naturally in Egyptian Arabic and receive answers that are:
1. **Grounded in their own ledger:** Exact numbers calculated from Drizzle ORM transactions.
2. **Zero Hallucination:** Clear about missing data without inventing numbers.
3. **Zero Token Cost for Deterministic Queries:** Direct SQL aggregation fast paths for spending totals and balances.
4. **Actionable with Safety Gates:** Mutations require explicit, reviewable two-phase confirmation drafts (`aiPendingActions` + `idempotencyKey`).
5. **Indistinguishable Native PWA Feel:** Flawless gesture interactions, safe-area layout padding, and iOS 26 Liquid Glass sheet physics.

---

## 2. 📋 Core User Jobs & Execution Paths

| User Job | Egyptian Dialect Example | Required Data Source | Response Mode | Cost Policy |
| :--- | :--- | :--- | :--- | :--- |
| **Check a Fact** | *"صرفت كام النهارده؟"* | `expenses`, `userWallets` | Deterministic SQL | $0.00 (0 LLM Tokens) |
| **Explore Spending** | *"وريني تصنيفات مصاريفي الشهر ده"* | `expenses` grouped by category | Deterministic breakdown + chart | $0.00 (0 LLM Tokens) |
| **Compare Periods** | *"قارن الشهر ده باللي فات"* | Two monthly period summaries | Deterministic comparison | $0.00 (0 LLM Tokens) |
| **Explain Classification**| *"كارفور اتحسب أكل ولا تسوق وليه؟"*| `expenses.classificationLogId` | Stored trace + rule logic | $0.00 (0 LLM Tokens) |
| **Correct a Ledger Item** | *"خلي مصروف أوبر مواصلات"* | Transaction lookup by ID/date | Action draft, then confirm | Structured LLM / Local |
| **Record a Transaction** | *"دفعت 250 لأحمد امبارح"* | 5-Layer waterfall parser | Action draft, then confirm | Layer-dependent |
| **Ask About People** | *"صرفت كام على ماما؟"* | `expenses.contactId` (`userContacts`) | Deterministic SQL | $0.00 (0 LLM Tokens) |
| **Plan a Goal / Budget** | *"أحوش للعربية إزاي؟"* | `financialGoals`, `userBudgets` | Grounded synthesis | 1 LLM pass max |
| **Recall a Preference** | *"فاكر اتفقنا على حد القهوة؟"* | `aiMemoryItems` + `aiMemoryEmbeddings` | Lexical-first, vector fallback | 0 or 1 embedding query |
| **App Guidance** | *"أربط SMS البنك إزاي؟"* | Static verified site guide | Deterministic | $0.00 (0 LLM Tokens) |

---

## 3. ⚙️ Agent Execution Contract & Safety Gates

```
User Message
    │
    ▼
Normalize & Deterministic Intent Routing (finance_query / action / advice / chat)
    │
    ▼
Compile Minimum Data Needs & Resolve SQL / Cache in Parallel
    │
    ├── If facts are sufficient ──► Return instant deterministic response (<15ms, $0.00)
    │
    └── If advice/synthesis needed ──► Bounded LLM synthesis over compact facts only
                                  ──► Generate confirmation draft (aiPendingActions) for any write
                                  ──► Persist short-term summary capsule & durable memory
```

### Non-Negotiable Agent Rules:
1. **No Silent Ledger Writes:** The LLM never writes to the ledger directly. All actions generate an `aiPendingActions` proposal with an `idempotencyKey` that requires user confirmation.
2. **Numbers are Structured Facts:** Financial numbers come from SQL queries; LLM prose is purely a presentation layer.
3. **Zero-Baseline Handling:** A missing prior period is clearly explained, never reported as a false `0%` drop.
4. **Exact Trace Attribution:** Explaining a past classification queries `expenses.classificationLogId`; legacy rows without traces are reported as untracked.

---

## 4. 🗄️ Core Data Model Foundations

- **Canonical Contact Identity (`expenses.contactId`):** Links transactions to `userContacts` (`relation`, `aliases`), enabling deterministic per-person calculations and contact counter updates.
- **Classification Trace Linkage (`expenses.classificationLogId`):** Links transactions to `classificationLogs`, recording the 5-layer parse decision, confidence, and rule metadata.
- **Wallet Foreign Key (`expenses.walletId`):** Indexes transactions to `userWallets` using `expenses_wallet_idx`, eliminating slow text-matching scans.
- **Client Idempotency (`expenses.clientRequestId`):** Enforces unique `(userId, userType, clientRequestId)` index constraint, preventing duplicate ledger entries upon network retries.
- **Taxonomy SSoT (`taxonomy-ssot.ts`):** Consolidates all category IDs, Arabic labels, and parent groupings across client UI and backend classifiers.

---

## 5. 📱 Mobile & PWA Native Safety Contract

- **Virtual Keyboard Avoidance:** Composer inputs remain anchored above the virtual keyboard; draft content is preserved upon network interruptions.
- **Safe-Area Shell:** `<main>` applies `pb-nav-safe` to all bottom navigation routes, eliminating layout collisions with iOS Home Indicators.
- **iOS 26 Liquid Glass Physics:** Smooth spring gestures with `vaul` drawer on mobile viewports (`< 1024px`) and centered Radix Dialog on desktop viewports (`>= 1024px`).
- **Offline Sync Outbox:** Explicit, idempotent outbox queue in `PwaEnhancements.tsx` with user review before background replay.

---

## 6. 🚀 Delivery Sequence & Completed Milestones

1. **Foundation (COMPLETE):** Deterministic SQL aggregation fast path (`resolvers.ts`), zero-cost finance answers, bounded chat context capsules, action proposal ownership verification.
2. **Data Integrity (COMPLETE):** 48 Drizzle schema tables, 44 relation exports in `db/relations.ts`, redundant index cleanup (`reports_user_idx`), and universal 35-table `purgeUserData` cascade.
3. **AI Classification Optimization (COMPLETE):** 5-layer waterfall preservation, deterministic SMS condensation (saving 40–70% tokens), modern model mapping (`gemini-3.1-flash-lite`, `gemini-3.1-pro`), and Hybrid V4 local TF-IDF vector embedding engine.
4. **PWA & Liquid Glass Suite (COMPLETE):** iOS 26 Liquid Glass primitives (`LiquidBottomSheet`, `LiquidSidebar`, `LiquidGlassCard`), synchronized 1024px responsive breakpoint, safe-area layout shell, and natural RTL swipe navigation.
5. **Backend Hardening (COMPLETE):** Advisory lock typing fix (`LockAcquiredRow`), structured `TRPCError` standardization across all 22 sub-routers, `aiProcedure` rate limits, and dual-user analytics aggregation.
