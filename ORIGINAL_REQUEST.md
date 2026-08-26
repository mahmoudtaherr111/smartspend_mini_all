# Original User Request

## 2026-08-25T02:56:14Z

# Teamwork Project Prompt — Launched

Smart Spend is an AI-powered expense management SaaS delivered as a Progressive Web App (PWA) with dual auth, Hono backend, tRPC v11, and a 5-layer hybrid AI classification engine. This project audits, hardens, and optimizes the existing codebase across 6 production workstreams with zero architectural regressions.

Working directory: E:\smartspend_V1_fixed
Integrity mode: development

## Requirements

### R1. PWA-to-Native Parity & Visual Polish
- Achieve 100% indistinguishable native feel on iOS and Android after "Add to Home Screen".
- Audit and refine design system: typography, spacing, corner radii, animations, touch targets, and safe-area insets.
- Maintain dual first-class parity: flawless as an installed mobile PWA and as a responsive desktop/mobile website.
- Use multi-agent browser auditing with adversarial reviewer personas (harsh critic, small viewport phone, UX/UI comfort, marketing premium feel).

### R2. "Liquid Glass" iOS 26-Style Bottom Sheet / Sidebar
- Research and implement an iOS 26-inspired "Liquid Glass" material sheet with smooth drag-to-reveal gesture interactions.
- Fluid unhurried physics, backdrop blur/saturation/specular highlights, and subtle scale/zoom perspective shifts during drag.
- Fully integrated with existing navigation, modals, and theme system (dark/light mode).

### R3. Performance Optimization (Client Experience vs. Server Load)
- Maximize UI responsiveness (sub-50ms interaction latency, 60fps animations, optimized bundle size) while simultaneously reducing server overhead.
- Trace bottlenecks via profiling: in-memory caching (`settings-cache.ts`), database query optimization, Redis scans, and tRPC payload minimization.
- Establish measurable benchmarks before and after optimization passes.

### R4. Database Architecture & Schema Review
- Audit all 48 Drizzle schema tables, indexes, and relations (`db/schema.ts`, `db/relations.ts`).
- Verify dual-user relationships (`oauthUser`, `localUser`), index coverage for queries, and transactional integrity.
- Implement recommended modern schema improvements or confirm structural optimality with empirical evidence.

### R5. Code Logic, Security & Quality Hardening
- Audit for bugs, race conditions, edge cases, session leaks, and error handling across all 21 tRPC sub-routers and Hono endpoints.
- Conduct simulated user sessions (20–30 scenarios) including security vulnerability probes (RBAC, CSRF, IDOR, rate limits).
- Escalate any medium-to-large architectural or business logic ambiguities before altering behavior.

### R6. Hybrid Classification Engine Optimization (Zero Architectural Change)
- Optimize the 5-layer classification waterfall without modifying its core architecture (`Muscle Memory` → `Rules` → `Vector` → `Gemini/DeepSeek` → `Dispute Resolver`).
- Research and implement optimal input condensation/truncation for raw SMS/bank notifications to eliminate token waste.
- Benchmark and resolve dialect edge cases (Egyptian/Arabic vernacular), ambiguous merchant names, and multi-item descriptions.
- Maximize classification accuracy and reduce token consumption.

### R7. Documentation Refresh & Final Engineering Report
- Audit and update all markdown files in `docs/` against current codebase realities (remove stale model names, obsolete routes, or deprecated configs).
- Deliver a comprehensive final engineering report detailing:
  1. All implemented changes with rationales and measured metrics.
  2. All escalated / deferred items requiring explicit user architectural sign-off.

## Verification Resources & Infrastructure
- **Type Safety & Build:** `npm run check` (TypeScript typecheck across monorepo), `npm run build`.
- **Test Suite:** `npm run test` (Vitest test suite with 424+ tests across 68 test suites).
- **Runtime Environment:** Hono dev server + Vite dev plugin (`npm run dev`) or standalone backend (`npm run backend:dev`).
- **Database Migrations:** `npm run db:generate` & `npm run db:push` (MySQL 8).
- **Environment & Models:** Google Gemini (`gemini-3.1-flash-lite`, `gemini-3.5-pro` via `api/lib/model-mapper.ts`), Groq, Fireworks.

## Acceptance Criteria

### PWA & Visual Quality
- [ ] Installed PWA passes adversarial mobile audit across iOS Safari / WebKit and Android Chrome viewports.
- [ ] Zero layout shifts, proper safe-area padding (`env(safe-area-inset-*)`), and native-feeling touch interactions.
- [ ] "Liquid Glass" bottom sheet drags smoothly with fluid inertia and subtle scale effect without frame drops.

### Performance & Backend
- [ ] Measurable reduction in TTFB, bundle payload, and redundant database roundtrips.
- [ ] All tRPC endpoints uphold rate limits and cached settings paths (`getSystemSettings()`).
- [ ] Monorepo passes `npm run check` with zero TypeScript errors and `npm run test` with 100% passing test suites.

### AI Classification Engine
- [ ] Token usage per classification request reduced via smart input condensing.
- [ ] Zero regressions across existing benchmark test fixtures in `tests/`.
- [ ] Existing 5-layer pipeline architecture preserved exactly as specified in `AGENTS.md` and `docs/03-AI_CLASSIFICATION_ENGINE.md`.

### Documentation & Deliverables
- [ ] Every document in `docs/` (01 through 09) matches the exact codebase implementation with zero obsolete references.
- [ ] Final Engineering Report delivered with detailed audit logs, performance deltas, and explicit escalation list.
