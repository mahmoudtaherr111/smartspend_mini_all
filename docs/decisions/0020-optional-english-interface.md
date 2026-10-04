# Optional English interface mode

Status: implemented, 2026-10-04.

SmartSpend AI is an Arabic-first personal finance platform tailored for Egypt. However, users who prefer navigating apps in English require an interface language option without undermining the core Egyptian financial taxonomy and Egyptian Arabic voice/text input.

## Decision
1. **Arabic is default and source of truth.** All UI keys originate in `src/i18n/ar.ts`, written in polite Egyptian phrasing adhering to `docs/guides/writing-app-messages.md`.
2. **Interface presentation only.** English mode (`src/i18n/en.ts`) translates UI buttons, headers, navigation labels, and settings. Transaction categorization, notes, spoken/written user inputs, and database records remain Egyptian Arabic.
3. **Zero payload overhead for Arabic users.** English dictionary is loaded on demand only when English is active.
4. **Bidirectional layout without flashes.** `index.html` evaluates `localStorage` before the first frame to set `dir` and `lang` on `<html>`. The app root uses Radix DirectionProvider and Tailwind logical utilities (`ms-`, `me-`, `ps-`, `pe-`, `border-s-`) to mirror navigation and controls cleanly.
5. **AI Center and Financial Engines.** Prompts, models, tool calling pipelines, and chatbot responses remain in Egyptian Arabic. Only UI tab names and headers adapt to the selected UI language.
