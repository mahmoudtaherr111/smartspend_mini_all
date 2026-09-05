# Orchestration Plan — SWE Light Font Self-Hosting

## Objective
Self-host Cairo and Inter fonts using Fontsource Variable packages in SmartSpend AI to remove external Google Fonts CDN dependencies, eliminate render-blocking network roundtrips, and ensure 100% offline font availability for the PWA.

## SWE Light Sequential Refinement Pipeline
1. **Phase 1: Implementation**
   - Dispatch `teamwork_preview_implementer` with verbatim requirements.
   - Implementer installs `@fontsource-variable/cairo` and `@fontsource-variable/inter`, imports them in `src/index.css`, adjusts font family fallback stacks, removes Google Fonts links from `index.html`, and verifies `npm run check` and `npm run build`.

2. **Phase 2: Review Round 1 (Adversarial)**
   - Dispatch `teamwork_preview_reviewer` with verbatim task + Implementer report.
   - Reviewer attempts to break diff, checks edge cases, verifies weights, Tailwind font stack, and PWA offline behavior.

3. **Phase 3: Review Round 2 (Adversarial)**
   - Dispatch fresh `teamwork_preview_reviewer` with verbatim task + Round 1 report + open ledger.
   - Further edge case detection and verification.

4. **Phase 4: Review Round 3 (Adversarial)**
   - Dispatch fresh `teamwork_preview_reviewer` with verbatim task + Round 2 report + open ledger.
   - Final hardening and verification before audit.

5. **Phase 5: Orchestrator Verification & Victory Audit**
   - Orchestrator independently checks git diff and runs `npm run check` and `npm run build`.
   - Dispatch `teamwork_preview_victory_auditor` for independent verification.

6. **Phase 6: Final Reporting & Handoff**
   - Write `handoff.md` and send completion message to parent.
