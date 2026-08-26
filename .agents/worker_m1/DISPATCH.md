## 2026-08-26T02:06:30Z
You are Worker 1 for Milestone M1 (Home Header & Top Financial Metrics Compaction).
Your working directory is: E:\smartspend_V1_fixed\.agents\worker_m1
Your exclusive write ownership: `src/pages/Home.tsx`.

## Scope & Instructions:
1. Read E:\smartspend_V1_fixed\.agents\ORIGINAL_REQUEST.md, E:\smartspend_V1_fixed\PROJECT.md, and E:\smartspend_V1_fixed\AGENTS.md.
2. Review the survey report and code recommendations in `E:\smartspend_V1_fixed\.agents\explorer_survey_2\report.md`.
3. Modify `src/pages/Home.tsx` to implement:
   - **Integrated Title Bar & StreakCounter**: On mobile and desktop, align `h1` greeting/title, `HealthBadge`, business toggle, and `StreakCounter` on a unified responsive horizontal row (`flex items-center justify-between gap-2`). Remove the dedicated mobile Streak row.
   - **Streamlined Subtitle**: Replace the 74-character 2-line subtitle with a single-line compact dynamic greeting (`text-xs text-muted-foreground truncate`), recovering ~24px of vertical height.
   - **High-Density SummaryChip Financial Pills**: Refactor `SummaryChip` from bulky frosted cards into compact single-line financial pills with `py-2 px-3 rounded-xl border backdrop-blur-md flex items-center justify-between` and `gap-2` grid, recovering ~38px of vertical height.
   - Maintain all existing functionality, month selector in stats/calendar views, business mode toggling, and dark mode styling.
4. Verify by running `npm run check` and `npm run test` to guarantee 0 TypeScript errors and 100% test pass.
5. Write your implementation report to `E:\smartspend_V1_fixed\.agents\worker_m1\report.md` and handoff to `E:\smartspend_V1_fixed\.agents\worker_m1\handoff.md`.
6. Send a completion message to the parent orchestrator.
