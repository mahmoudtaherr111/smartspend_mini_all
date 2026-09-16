# System explanations

SmartSpend is divided into systems, the parts people talk about: recording spending, bank messages, the AI Center
and so on. Every code module, API procedure, screen, route and scheduled job belongs to exactly one system, as set
in `docs/architecture/systems.json`; the atlas fails on anything unassigned.

Each system has three pages:

| Page | For | Kept true by |
| --- | --- | --- |
| `docs/systems/<id>.md` (this folder): how it works, where to change what, rules, tests, known issues | engineers and agents | a check against the code it describes (below) |
| `docs/ar/systems/<id>.md`: the same story without code, in Egyptian Arabic | people who do not read code | a check against the English page |
| `docs/atlas/systems/<id>.md`: every file, procedure, table, route and job, with diagrams | everyone | `npm run atlas`, from the code |

## Find the system for a task
| System | Start here when the task is about | Explanation | بالعربي | Facts |
| --- | --- | --- | --- | --- |
| Recording spending | typing, dictating or photographing an expense; categories and classification; muscle memory; clarifying questions; saving parsed items | [expense-capture.md](expense-capture.md) | [عربي](../ar/systems/expense-capture.md) | [facts](../atlas/systems/expense-capture.md) |
| Bank and wallet messages | bank or wallet SMS and notifications; the Android companion app; the iOS Shortcut; webhook tokens | [bank-messages.md](bank-messages.md) | [عربي](../ar/systems/bank-messages.md) | [facts](../atlas/systems/bank-messages.md) |
| Live voice assistant | the live voice call, Gemini Live, voice tools and the call archive | [voice-calls.md](voice-calls.md) | [عربي](../ar/systems/voice-calls.md) | [facts](../atlas/systems/voice-calls.md) |
| AI Center | the chat assistant: turn planning, finance answers, memory, proposed actions, the site guide | [ai-center.md](ai-center.md) | [عربي](../ar/systems/ai-center.md) | [facts](../atlas/systems/ai-center.md) |
| Reports, insights and the smart profile | monthly and yearly insights, month comparison, the Pro report, onboarding questions, the smart profile | [insights.md](insights.md) | [عربي](../ar/systems/insights.md) | [facts](../atlas/systems/insights.md) |
| Money | the dashboard, expense lists and statistics, wallets, budgets, goals, business mode, contacts, rollups, export | [money.md](money.md) | [عربي](../ar/systems/money.md) | [facts](../atlas/systems/money.md) |
| Accounts, sign-in and security | Google sign-in, phone accounts and codes, passkeys, sessions, rate limits, security headers, account deletion | [accounts.md](accounts.md) | [عربي](../ar/systems/accounts.md) | [facts](../atlas/systems/accounts.md) |
| Plans and payments | Free, Pro and Ultra; Paymob checkout and webhook; referrals; subscription expiry | [billing.md](billing.md) | [عربي](../ar/systems/billing.md) | [facts](../atlas/systems/billing.md) |
| Notifications and WhatsApp | web push, in-app notifications, scheduled and activity messages, the WhatsApp service | [notifications.md](notifications.md) | [عربي](../ar/systems/notifications.md) | [facts](../atlas/systems/notifications.md) |
| Admin console, support and growth tools | the admin console and its settings, support tickets, ads, SEO pages, analytics | [admin.md](admin.md) | [عربي](../ar/systems/admin.md) | [facts](../atlas/systems/admin.md) |
| AI providers and usage limits | model providers, routing and fallback, model names, token limits and budgets, AI cost | [ai-platform.md](ai-platform.md) | [عربي](../ar/systems/ai-platform.md) | [facts](../atlas/systems/ai-platform.md) |
| Server platform and data | server and tRPC wiring, environment variables, caches, the database schema, file storage, jobs, data retention | [platform.md](platform.md) | [عربي](../ar/systems/platform.md) | [facts](../atlas/systems/platform.md) |
| Web and mobile app shell | routes and guards, layout, PWA install and offline behaviour, UI primitives, hooks, client utilities | [web-app.md](web-app.md) | [عربي](../ar/systems/web-app.md) | [facts](../atlas/systems/web-app.md) |

Before you change a file, find its systems in `docs/atlas/systems/files.md` and read their explanations. A file
that several systems share is split there down to single procedures, routes and jobs.

Looking for something to pick up, or wondering how fresh these pages are? `docs/atlas/systems/state.md` gathers
every known issue from every page, with each system's last check, the tests it names, and whether its Arabic page
is in line. It is generated, so it can never disagree with the pages themselves.

## How these pages stay true
- Each explanation was checked against the source it describes, listed at the end of its facts page. The check is
  recorded in `docs/systems/verified.json` as a fingerprint per file, or per procedure, route or job of a shared
  file, together with the day it was recorded and the commit the work sat on. The generated index
  [docs/atlas/systems/README.md](../atlas/systems/README.md) shows that day per system, so you can see at a
  glance how recent an explanation is.
- When that source changes, `npm run agent:finish` names the explanation and what changed. Read the change,
  correct the page wherever it no longer matches the code, then run `npm run docs:verify -- <id>`.
- An edited English page asks for the Arabic page to be brought in line; then run
  `npm run docs:verify -- <id> --ar`.
- The pre-push hook refuses a push while a page is unchecked because of your branch's changes. A page left
  unchecked by someone else's change is shown as a notice, not a failure.
- `docs/systems/verified.json` merges entry by entry (`scripts/agent/verified-ledger.mjs`), so two branches that
  re-check the same system do not conflict. Never edit it by hand.
- The rules live in `scripts/knowledge/systems-docs.ts`; `tests/knowledge/systems.test.ts` runs them in CI.

## Writing a page
- Describe what the code does now, read in the code itself. Never copy a sentence from an old document or plan.
- Name code as `path#name`, for example `api/lib/smart-pipeline.ts#runSmartPipeline`: the documentation rules fail
  when the file or the name disappears. Refer to line numbers nowhere.
- No counts of things the atlas counts (procedures, tables, routes, pages); link the facts page instead.
- Start every known issue with its severity: `**Security.**` for a leak, a bypass or secrets in a log,
  `**Bug.**` when the user sees a wrong result or loses work, `**Gap.**` for code with no screen or a promise
  with no code, `**Debt.**` for dead code, duplication, estimates and missing tests. The Arabic page uses
  `**أمن.**`, `**عطل.**`, `**ناقص.**` and `**دين تقني.**`. The state page sorts by these words, and
  `npm run issues:sync` opens issues for the serious ones.
- Keep the sections: the pieces, the journey step by step, where to change what, rules for changes, tests, known
  issues (each one verified and located), related systems.
- The Arabic page tells the same story for someone who does not program: what the system does for the user, a small
  diagram, an example, the decisions it makes, what can go wrong, and how to ask for a change.
- A new system: add it to `docs/architecture/systems.json`, run `npm run atlas`, write both pages, link them from
  both indexes, then record the checks with `npm run docs:verify`.
