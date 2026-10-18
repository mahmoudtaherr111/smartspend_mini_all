# docs/

| Folder | What it is | Edited by |
| --- | --- | --- |
| `systems/` | What each part of the app does, how to change it, its rules, tests and known issues; `docs/systems/verified.json` records each page as checked against the code | people, re-checked with `npm run docs:verify` |
| `atlas/` | Facts extracted from the code: procedures, tables, routes, jobs, pages, modules, environment, plus one page per system and `docs/atlas/systems/files.md` | `npm run atlas` only |
| `architecture/` | LikeC4 model of the system: `generated/` from the code, plus hand-written kinds, context, views, flows and the module and external-system maps | generator and people; see `architecture/README.md` |
| `decisions/` | Architecture decisions with their date and consequences; add a record instead of rewriting one | people |
| `guides/` | How to run and deploy the system, written from the code and configuration | people |
| `reports/` | Output of benchmark, QA and storage runs | the scripts that produce them |
| `releases/` | Release notes | people |
| `ar/` | Arabic guide for the project owner, and `ar/systems/`: the same system explanations without code | people |

The apps have their own guides next to their code, not here: the Flutter app for Android and iOS in `mobile/`
([README](../mobile/README.md), why it exists in [decision 0022](decisions/0022-flutter-mobile-app.md)) and the
Kotlin companion that forwards bank notifications in `android-app/` ([README](../android-app/README.md)).

Trust order: the code, then `atlas/` and `architecture/generated/`, then the rules in `AGENTS.md`, then
`systems/` (checked against the code, and re-checked whenever that code changes), then `architecture/flows/`,
then `reports/` (history only).

Agents start at the root `AGENTS.md`. To find the part of the app a task belongs to, start at
`systems/README.md`; for what is waiting to be fixed and how fresh each explanation is, `atlas/systems/state.md`
(and `docs/atlas/systems/state.ar.md` for the same in Arabic).
