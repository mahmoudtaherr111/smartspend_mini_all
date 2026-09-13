@AGENTS.md

# Claude Code notes

- This checkout is on Windows: `CLAUDE.md` imports `AGENTS.md` instead of symlinking it, and each folder
  with its own `AGENTS.md` has a `CLAUDE.md` that does the same.
- The `likec4` MCP server in `.mcp.json` answers questions about the architecture model (for example
  "who writes expenses" or "what does chat.sendMessage use"). It needs `npm run arch:install` once.
- Single test: `npx vitest run <path>`; by name: `npx vitest run -t "<name>"`. `vitest.config.ts`
  injects dummy `DATABASE_URL`, `GEMINI_API_KEY` and OAuth values, so unit tests start without real
  services; tests that talk to MySQL fail without one.
