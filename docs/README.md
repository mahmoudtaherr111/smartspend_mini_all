# docs/

| Folder | What it is | Edited by |
| --- | --- | --- |
| `atlas/` | Facts extracted from the code: procedures, tables, routes, jobs, pages, modules, environment | `npm run atlas` only |
| `architecture/` | LikeC4 model of the system: `generated/` from the code, plus hand-written kinds, context, views, flows and the module and external-system maps | generator and people; see `architecture/README.md` |
| `decisions/` | Architecture decisions with their date and consequences; add a record instead of rewriting one | people |
| `guides/` | How to run and deploy the system, written from the code and configuration | people |
| `reports/` | Output of benchmark, QA and storage runs | the scripts that produce them |
| `releases/` | Release notes | people |
| `ar/` | Arabic guide for the project owner | people |

Trust order: the code, then `atlas/` and `architecture/generated/`, then the rules in `AGENTS.md`, then
`architecture/flows/`, then `reports/` (history only).

Agents start at the root `AGENTS.md`.
