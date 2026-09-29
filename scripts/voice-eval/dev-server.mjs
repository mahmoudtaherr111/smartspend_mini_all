/**
 * The app in development (Vite with the API) on port 3007, against the evaluation database (`<name>_eval`, see
 * scripts/voice-eval/run.ts) and Redis database 7, to try screens on fabricated users without touching the
 * development data. `npx tsx scripts/voice-eval/seed-browser-user.ts` gives it a user to sign in with.
 */
import { spawn } from "child_process";
import dotenv from "dotenv";

dotenv.config();
const url = String(process.env.VOICE_EVAL_DATABASE_URL ?? process.env.DATABASE_URL ?? "")
  .replace(/\/([A-Za-z0-9_]+)(\?|$)/, (_m, name, tail) => `/${name.endsWith("_eval") ? name : `${name}_eval`}${tail}`);
if (!/\/[A-Za-z0-9_]+_eval(\?|$)/.test(url)) {
  console.error("No evaluation database: set DATABASE_URL or VOICE_EVAL_DATABASE_URL.");
  process.exit(1);
}
const env = { ...process.env, DATABASE_URL: url, ...(process.env.REDIS_URL ? { REDIS_URL: process.env.REDIS_URL.replace(/(\/\d+)?$/, "/7") } : {}) };
const child = spawn("npx", ["vite", "--port", "3007", "--strictPort"], { stdio: "inherit", shell: true, env });
child.on("exit", (code) => process.exit(code ?? 0));
