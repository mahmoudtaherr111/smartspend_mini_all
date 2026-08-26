# Project: SmartSpend AI Mobile Dashboard & AI Recording Input Re-architecture

## Architecture
- **Framework & Libraries**: React 18, Vite 7, TypeScript 5.9, Tailwind CSS v3.4, `framer-motion`, shadcn/ui components, Lucide icons, tRPC v11.
- **Affected Components**:
  - `src/components/expenses/ExpenseForm.tsx`: AI discovery banner morphing (`framer-motion`), dynamic recording state pill (7-bar waveform + timer), textarea dimensions (`min-h-[96px]`), elevated thumb-zone action bar (`h-12`).
  - `src/pages/Home.tsx`: StreakCounter title bar integration, single-line dynamic subtitle, SummaryChip high-density financial pills (`py-2 px-3`), above-the-fold vertical space budgeting (~120px saved in header/metrics + ~198px across form = ~318px total).
  - `tests/e2e/mobile-dashboard-ai-recording.spec.ts`: Autonomous multi-viewport Playwright audit across iPhone 14 Pro (`390x844`) and Android Pixel 7 (`412x915`), validating 0 layout shifts (CLS < 0.05), 0 console errors, 0 clipping, and above-the-fold transaction visibility.
- **State Flow**:
  - Recording State Machine: `flowStage` (`idle` | `recording` | `processing` | `parsed` | `clarify` | `review`), `isRecording`, `recordingDuration`.
  - Banner State: `isBannerCollapsed` (persisted in localStorage `smartspend_ai_banner_collapsed`, toggleable via `✨ تسجيل ذكي` badge / minimize chevron).
  - Financial Metrics: `currentMonthSummary`, `monthlyStats` formatted into compact financial pills with responsive grid.

## Feature Inventory
| # | Feature | Description | Milestone | Status | Source |
|---|---------|-------------|-----------|--------|--------|
| 1 | Fluid Morphing AI Discovery Banner | `framer-motion` collapsible banner in `ExpenseForm.tsx` (0 <-> auto height with 0 dead whitespace, leaving minimal inline badge `✨ تسجيل ذكي` and chevron toggle) | M2 | DONE | Request §1 |
| 2 | Contextual Dynamic Recording State | Remove static "الحالة: جاهز", dynamic waveform / processing pill during active recording/parsing, seamless return to compact idle 0px height | M2 | DONE | Request §2 |
| 3 | Top Financial Metrics & Streak Header Compaction | In `Home.tsx`, integrate StreakCounter directly into title bar, streamline 2-line subtitle into single-line greeting, refactor SummaryChip into compact financial pills `py-2 px-3` saving ~120px | M1 | DONE | Request §3 |
| 4 | Thumb-Zone Textarea & Action Bar Elevation | Elevated 60-90px on mobile (`min-h-[96px]`), rich placeholder prompt, recent transactions visible above the fold on 390x844 & 412x915 | M1/M2 | DONE | Request §4 |
| 5 | Multi-Viewport In-Browser Mobile Auditing | Autonomous Playwright test suite (`tests/e2e/mobile-dashboard-ai-recording.spec.ts`) across iPhone 14 Pro (390x844) & Pixel 7 (412x915), verifying CLS < 0.05, 0 console errors, 0 clipping, 100% type & test pass | Test Track | DONE | Request §5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| T1 | E2E Testing Track | Design & implement autonomous Playwright mobile audit suite (`tests/e2e/mobile-dashboard-ai-recording.spec.ts`) and `TEST_INFRA.md` | Survey | DONE |
| M1 | Home Header & Metrics Compaction | Update `src/pages/Home.tsx` to integrate StreakCounter into title bar, streamline subtitle, and refactor SummaryChip into high-density `py-2 px-3` pills | Survey | DONE |
| M2 | AI Discovery Banner & Dynamic Recording Input | Update `src/components/expenses/ExpenseForm.tsx` with framer-motion collapsible banner, active recording waveform pill, elevated thumb-zone action bar | Survey | DONE |
| M3 | Final Verification & Forensic Audit | Run 100% E2E Playwright tests, Vitest test suites, `npm run check`, Challenger stress verification, and Forensic Integrity Audit | M1, M2, T1 | DONE |

## Code Layout
- `src/pages/Home.tsx`: Exclusive write ownership for Milestone 1.
- `src/components/expenses/ExpenseForm.tsx`: Exclusive write ownership for Milestone 2.
- `tests/e2e/mobile-dashboard-ai-recording.spec.ts`: Exclusive write ownership for E2E Testing Track (T1).
- `TEST_INFRA.md`, `TEST_READY.md`: Test track coordination artifacts at project root.

## Interface Contracts
### `ExpenseForm.tsx` ↔ `Home.tsx`
- `ExpenseForm` rendered inside `Home.tsx` receiving props:
  - `onExpenseCreated`: `() => void`
  - `onEditExpense`: `(expense: any) => void`
  - `editingExpense`: `any | null`
  - `onCancelEdit`: `() => void`
- Header / Streak counter inside `Home.tsx` operates independently of `ExpenseForm` state.
- All AST tokens required by `src/components/expenses/ExpenseForm.quick-save.test.ts` (`handleSubmit`, `syncOfflineData`, `ParserTracePanel`, `inputChannel: "text"`) preserved 100%.
