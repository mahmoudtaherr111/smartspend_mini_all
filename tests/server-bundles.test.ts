/**
 * The server bundles start. `npm run build` bundles api/boot.ts into dist/boot.js, the file the Docker image runs,
 * and `npm run backend:build` bundles api/server.ts into dist/server/server.js. A bundle can build and still not
 * load: sharp 0.35 brought a top-level `createRequire` import into dist/boot.js that collided with the one in
 * esbuild's banner, and the server died with a SyntaxError before its first request. So each bundle is started the
 * way production starts it and asked for /health.
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const ROOT_DIR = path.resolve(__dirname, "..");

const BUNDLES = [
  { file: "dist/boot.js", script: "npm run build" },
  { file: "dist/server/server.js", script: "npm run backend:build" },
];

// vitest.config.ts loads the real .env into this process, so the server gets no copy of process.env: only what
// the operating system needs, and dummy values for the variables api/lib/env.ts requires. It also starts in an
// empty directory, where `dotenv/config` finds no .env and boot finds no WhatsApp session. Crons, WhatsApp, Redis
// and Sentry stay off, and nothing listens on port 1, so the reads at boot fail at once.
const SYSTEM_KEYS = ["PATH", "SystemRoot", "TEMP", "TMP", "TMPDIR"];

function serverEnv(port: number): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of SYSTEM_KEYS) if (process.env[key] !== undefined) env[key] = process.env[key];
  return {
    ...env,
    NODE_ENV: "production",
    PORT: String(port),
    DATABASE_URL: "mysql://bundle:bundle@127.0.0.1:1/bundle",
    GOOGLE_CLIENT_ID: "bundle-test",
    GOOGLE_CLIENT_SECRET: "bundle-test",
    JWT_SECRET: "bundle-test-secret",
    GEMINI_API_KEY: "bundle-test",
  };
}

// PORT=0 means 3000 to the server, so ask the system for a free port first.
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

const started: { child: ChildProcess; closed: Promise<unknown>; cwd: string }[] = [];

afterEach(async () => {
  for (const { child, closed, cwd } of started.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await closed;
    fs.rmSync(cwd, { recursive: true, force: true, maxRetries: 5 });
  }
});

async function startAndAskForHealth(file: string) {
  const port = await freePort();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "smartspend-bundle-"));
  const child = spawn(process.execPath, [path.join(ROOT_DIR, file)], { cwd, env: serverEnv(port) });
  let output = "";
  child.stdout?.on("data", (chunk) => (output += chunk));
  child.stderr?.on("data", (chunk) => (output += chunk));
  // "close" comes after the last output, so a server that died has said why by then.
  let hasClosed = false;
  const closed = new Promise((resolve) => child.once("close", resolve)).then(() => (hasClosed = true));
  started.push({ child, closed, cwd });

  const deadline = Date.now() + 45_000;
  while (!hasClosed && Date.now() < deadline) {
    const response = await fetch(`http://127.0.0.1:${port}/health`).catch(() => null);
    if (response) return { status: response.status, body: await response.text(), output };
    await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 250))]);
  }
  return { status: 0, body: "", output };
}

// Needs the bundles: npm run build, npm run backend:build, then npm run test:build (docs/guides/testing.md).
describe.runIf(process.env.REQUIRE_BUILD === "1")("server bundles", () => {
  for (const { file, script } of BUNDLES) {
    it(`${file} starts in production and answers /health`, async () => {
      expect(fs.existsSync(path.join(ROOT_DIR, file)), `${file} is missing: run ${script} first`).toBe(true);

      const { status, body, output } = await startAndAskForHealth(file);

      // On failure, the server's own output says why: a SyntaxError, a missing module, a variable env.ts refused.
      expect({ status, body }, output.slice(-4000)).toMatchObject({
        status: 200,
        body: expect.stringContaining('"status":"ok"'),
      });
    }, 60_000);
  }
});
