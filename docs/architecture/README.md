# Architecture model (LikeC4)

A navigable diagram of SmartSpend whose content comes from the code. The same model answers agents'
questions through MCP.

## Use it
- `npm run arch:install` once. LikeC4 lives in `tools/architecture/` because it needs React 19 and
  Node 22.22.3 or newer, which the app does not use.
- `npm run arch` starts the viewer (search, zoom, click through to child views).
- `npm run arch:build` writes a static site; `npm run arch:build -- --output-single-file` writes it as one
  HTML file.
- `npm run arch:validate` checks syntax and references. CI runs it.
- Agents: the `likec4` server in `.mcp.json` (and in `.opencode/opencode.json`) exposes the model.

## Files
| File | Written by | Content |
| --- | --- | --- |
| `generated/*.c4` | `npm run atlas` | routers and procedures, HTTP and WebSocket endpoints, jobs, pages, code modules, tables, outside systems, and every relationship between them |
| `spec.c4` | people | element kinds and relationship kinds |
| `context.c4` | people | the people and apps around the system, and the containers the generator fills |
| `views.c4` | people | overview views; `generated/views.c4` adds one view per router and module |
| `flows/*.c4` | people | important journeys as dynamic views |
| `clusters.json` | people | which runtime file belongs to which module (first matching rule wins) |
| `externals.json` | people | which packages, hosts or files mean an outside system |
| `likec4.config.json` | people | project name |

## Names in the model
- `smartspend.web.pages.<Page>`, `smartspend.web.shell`, `smartspend.web.modules.<module>`
- `smartspend.api.trpc.<router>.<procedure>`
- `smartspend.api.http.<method>_<path>` (for example `post_sms_ingest`), `smartspend.api.ws.<path>`
- `smartspend.api.scheduler.<job>`, `smartspend.api.modules.<module>`, `smartspend.shared.contracts`
- `smartspend.mysql.<table>`, stores such as `smartspend.redis`, outside systems at the top level
  (`gemini`, `paymob`, ...)

Relationship kinds: `calls` (page to procedure), `uses` (to a module or an outside system), `reads` and
`writes` (to a table), `imports` (module to module). An id that is a LikeC4 keyword gets a trailing
underscore.

## Writing a flow
- One step per line with full names: `a.b -> c.d 'what happens'`; a reply is `a <- b 'result'`.
- Every step needs a generated relationship between the two elements or their children;
  `tests/knowledge/flows.test.ts` fails otherwise. End a step the code cannot show, such as a person
  opening a page, with `// intent: <reason>`.
- In hand-written model files keep relationships at the top level of `model { }` and use full names, so
  the test can read them without LikeC4.
