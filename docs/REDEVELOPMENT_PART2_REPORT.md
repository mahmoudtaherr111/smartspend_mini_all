# SmartSpend Redevelopment — Part 2 Report (Pro)

**Date:** 2026-05-21  
**Branch:** `cursor/45aa70d1`  
**Depends on:** Part 1 (`docs/REDEVELOPMENT_PART1_REPORT.md`)

## Status

| Area | Status |
|------|--------|
| Pro AI routing (95% trivial rule only) | Done |
| `ai-classifier-pro.ts` | Done |
| Token spike caps + burst guard | Done |
| Pro monthly report engine | Done |
| Goals Free vs Pro | Done |
| Image / receipt (Pro) | Done |
| Frontend (Goals, Receipt, Export) | Done |
| Part 3 Dashboard | Not started |

## Architecture

### Pro vs Free separation

| Layer | Free | Pro / Ultra |
|-------|------|-------------|
| Routing | Rule → embedding → AI last | **AI-primary**; rule only if all items ≥ **95%** confidence |
| Classifier | `aiClassify()` compact | `aiClassifyPro()` full taxonomy + profile |
| Embedding shortcut | Yes (cost save) | **Disabled** |
| Dispute resolution | Off | On |
| Max output (parse) | 384 | 2048 (Pro), 3072 (Ultra) |

### Token protection (`ai-usage-policy.ts`)

- **Hard per-request caps:** e.g. Pro parse 6000, report 8000, image 2500 (blocks 10k+ spikes)
- **Burst guard:** events/minute per channel (Free 12, Pro 35, Ultra 60)
- Admin + per-user overrides unchanged (`user_token_limit_{type}_{id}`)

### Monthly reports (Pro)

- `pro-report-engine.ts`: dynamic prompt from goal, behavior snapshot, backend summary
- `generateMonthlyInsights` uses Pro engine when plan is pro/ultra
- `export.monthlyReportHtml` → printable HTML (invoice-style header/footer)

### Goals

- Table: `financial_goals` (requires `npm run db:push` or migration)
- **Free:** up to 3 active goals, description max 120 chars, Pro upsell card
- **Pro:** `goals.analyze` — AI plan, alerts, weekly actions (JSON stored in `ai_plan`)

### Image / SMS alignment

- **Pro only:** `image.parseReceipt` — vision JSON + `runPipeline` for categories
- OCR hint path + bank SMS regex before vision (token save)
- Expense `source: "image"`; integrates with existing SMS ingest (same classification stack when text extracted)

## Key files

| Path | Purpose |
|------|---------|
| `api/lib/ai-classifier-pro.ts` | Pro classification |
| `api/lib/ai-routing.ts` | Pro AI-primary routing |
| `api/lib/ai-usage-policy.ts` | Spike + burst limits |
| `api/services/pro-report-engine.ts` | Pro report prompts + HTML export |
| `api/goals-router.ts` | Goals API |
| `api/image-router.ts` | Receipt image API |
| `api/lib/receipt-image-parser.ts` | OCR heuristics + vision |
| `db/schema.ts` | `financial_goals` table |
| `src/components/goals/FinancialGoalsPanel.tsx` | Goals UI |
| `src/components/expenses/ReceiptCapture.tsx` | Camera UI (Pro) |
| `src/components/insights/AIInsights.tsx` | Pro HTML export button |

## Tests

Added:

- `api/lib/ai-routing.test.ts` — Pro AI-primary route
- `api/lib/receipt-image-parser.test.ts` — SMS amount extraction

Run locally:

```bash
npm run db:push   # create financial_goals table
npx vitest run
```

Prior session: **38 passed**; expect **40+** after Part 2 tests.

## Token benchmarks (estimated)

| Channel | Free | Pro |
|---------|------|-----|
| Parse (~100 words) | 800–1500 | 2500–4500 (richer context) |
| Monthly report | 1200–2000 | 3500–6000 |
| Receipt image | N/A | 800–2000 (vision + pipeline) |
| Goal analyze | N/A | 1200–2500 |

## Manual verification

- [ ] Pro user: voice expense → `routing.reason` = `pro_ai_primary` for non-trivial text
- [ ] Trivial "قهوة 20 جنيه" on Pro → still `pro_trivial_rule_95` at 0 tokens if rule ≥95%
- [ ] Generate monthly insights on Pro → longer report + `savings_tips` in JSON
- [ ] Export "تقرير Pro" downloads HTML
- [ ] Pro: capture receipt image → expense saved with category
- [ ] Free: goals show upsell; Pro: "تحليل Pro" on goal

## Blockers

1. **DB migration required** for `financial_goals` before goals API works in production
2. **Gemini API key** required for vision, Pro reports, goal analyze
3. Client-side image compression recommended (server truncates huge base64 as safety net only)

## Next: Part 3

- Admin dashboard sections (AI Free/Pro, tokens, tickets, limits)
- Business analytics aggregates
- Per-user token cap UI (backend key already exists)
