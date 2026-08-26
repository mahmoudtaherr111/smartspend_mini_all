## 2026-08-26T02:06:30Z
You are Worker 2 for Milestone M2 (ExpenseForm AI Discovery Banner & Dynamic Recording Input).
Your working directory is: E:\smartspend_V1_fixed\.agents\worker_m2
Your exclusive write ownership: `src/components/expenses/ExpenseForm.tsx`.

## Scope & Instructions:
1. Read E:\smartspend_V1_fixed\.agents\ORIGINAL_REQUEST.md, E:\smartspend_V1_fixed\PROJECT.md, and E:\smartspend_V1_fixed\AGENTS.md.
2. Review the survey report and blueprint in `E:\smartspend_V1_fixed\.agents\explorer_survey_1\report.md`.
3. Modify `src/components/expenses/ExpenseForm.tsx` to implement:
   - **Fluid Morphing AI Discovery Banner**: Use `framer-motion` (`AnimatePresence`, `motion.div`) to smoothly expand and collapse the AI discovery guidance banner to 0 height with 0 dead whitespace (`overflow-hidden`, `initial={{ height: 0, opacity: 0 }}`, `animate={{ height: "auto", opacity: 1 }}`). When collapsed, display a minimal inline badge button `✨ تسجيل ذكي` (and/or minimize toggle) allowing immediate re-expansion. Persist preference in `localStorage.getItem("smartspend_ai_banner_collapsed")`.
   - **Contextual Dynamic Recording Pill**: Remove static `"الحالة: جاهز"`. When `isRecording || flowStage === "processing"`, expand a dynamic waveform/processing pill (animated live frequency bars, timer `0:05`, pulse glow) that seamlessly collapses to 0 height when idle.
   - **Thumb-Zone Textarea & Action Bar Elevation**: Optimize textarea footprint (`min-h-[96px] sm:min-h-[120px] p-3.5 sm:p-5`), rich placeholder prompt, elevate the action bar buttons (`h-12 sm:h-14`), saving ~90px on mobile and ensuring recent transactions are visible above the fold on 390x844 and 412x915 viewports.
   - **PRESERVE ALL AST INVARIANTS**: Preserve all tokens asserted by `src/components/expenses/ExpenseForm.quick-save.test.ts` (`handleSubmit` calling `parseMutation.mutate`, `inputChannel: "text"`, `setLatestParserTrace(null)`, `syncOfflineData` comments, `ParserTracePanel` rendering).
4. Verify by running `npm run check` and `npm run test` (especially `ExpenseForm.quick-save.test.ts`) to ensure 0 TypeScript errors and 100% test pass.
5. Write your implementation report to `E:\smartspend_V1_fixed\.agents\worker_m2\report.md` and handoff to `E:\smartspend_V1_fixed\.agents\worker_m2\handoff.md`.
6. Send a completion message to the parent orchestrator.
