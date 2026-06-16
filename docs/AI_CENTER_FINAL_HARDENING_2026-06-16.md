# AI Center Final Hardening - 2026-06-16

## Scope

This pass closes the remaining AI Center gaps around old parser paths, wider actions, cost monitoring, production build verification, and final security checks.

## Completed

- `parseExpense` and `parseVoiceExpense` are now explicit AI Center classification nodes, not ambiguous legacy parser paths.
- Parser traces now expose:
  - `schemaVersion=2`
  - `engine=classification_engine.v1`
  - `agentBoundary=independent_classification_engine`
  - `dataNeeds`
  - `costPolicy`
  - LLM calls, embedding calls, token counts, latency, provider, and risk.
- `ExpenseForm` now renders the expanded parser trace for text and voice expense QA.
- Runtime actions now include:
  - `goal.update`
  - `goal.stop`
  - `expense.recategorize`
  - `wallet.update`
- The new actions stay inside the existing draft, confirm, cancel, execute, audit, and action-memory flow.
- Every new action execution scopes DB mutation by both `userId` and `userType`.
- Reversible update actions store previous state and can be undone through `action.undo`.
- Voice `action_draft` now uses the same runtime action contract as chat.
- High-risk voice actions, currently `goal.stop`, require UI confirmation and cannot be executed by voice confirmation alone.
- Added `api/services/ai-cost-analytics.ts`.
- Added admin query `admin.getAICostOverview`.
- Cost overview aggregates:
  - tokens
  - cost units
  - LLM calls
  - embedding calls
  - tool calls
  - latency
  - cache hit rate
  - fallback rate
  - groups by channel, route, and user.

## Verified

Focused tests passed:

```bash
npx vitest run api/services/parser-trace.test.ts api/services/action-runtime/extended-actions.test.ts api/services/ai-cost-analytics.test.ts api/services/voice-kernel/voice-tool-adapter.test.ts
```

Security and regression tests passed:

```bash
npx vitest run api/services/action-runtime/index.test.ts api/chat-router.phase4.test.ts api/dev-qa-paths.test.ts api/services/ai-memory/vector-store.test.ts api/services/ai-memory/memory-writer.test.ts api/services/ai-memory/embedding-client.test.ts
```

Type/build checks passed:

```bash
npm run check
npm run build
```

Production-like smoke passed:

```bash
NODE_ENV=production PORT=5199 node dist/boot.js
GET http://127.0.0.1:5199/health
```

Result: `/health` returned `status=ok`, then the process was stopped.

Secret scan:

- No hardcoded `fw_...` Fireworks key was found in `api`, `src`, `docs`, or `package.json`.

## Remaining Non-Blocking Items

- `budget.create` is still a confirmed budget plan stored in `ai_action_memory`; a real budget table/model is still needed for first-class persisted budgets.
- Production build passes, but Vite reports large chunk warnings.
- Browserslist data is stale and should be refreshed as frontend maintenance.
- Redis must be configured in production. Without Redis, production cache policy disables RAM fallback unless explicitly overridden.
