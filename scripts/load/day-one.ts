/**
 * The day-one load test: 1,000 people with a month of records each, of whom 100 use the app at the same moment, on
 * the real server code, one process, a real MySQL and Redis. Each simulated person opens the record tab, the stats tab
 * and the wallets, records something, and goes on. It prints the time of each call and every failure.
 *
 * It writes rows, so it runs only on a throwaway database on port 3399 (docs/guides/testing.md):
 *   npx tsx scripts/load/day-one.ts [seconds=60] [concurrent=100] [people=1000]
 */
import { serve } from "@hono/node-server";
import { sql } from "drizzle-orm";
import { expenses, localUsers } from "../../db/schema";
import { db } from "../../api/queries/connection";
import { createSession, generateToken } from "../../api/local-auth-utils";

const seconds = Number(process.argv[2] ?? 60);
const concurrent = Number(process.argv[3] ?? 100);
const people = Number(process.argv[4] ?? 1000);
const firstId = 500_000;
const port = 3006;

interface Sample {
  ms: number;
  ok: boolean;
  detail?: string;
}
const samples = new Map<string, Sample[]>();

function note(name: string, sample: Sample) {
  const list = samples.get(name) ?? [];
  list.push(sample);
  samples.set(name, list);
}

async function call(token: string, path: string, input?: unknown, mutation = false) {
  const started = performance.now();
  const url = new URL(`http://127.0.0.1:${port}/api/trpc/${path}`);
  if (!mutation && input !== undefined) url.searchParams.set("input", JSON.stringify(input));
  try {
    const response = await fetch(url, {
      method: mutation ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "SmartSpend-Mobile (load)",
      },
      body: mutation ? JSON.stringify(input) : undefined,
    });
    const body = (await response.json()) as { error?: { message?: string; data?: { code?: string } } };
    const failed = !response.ok || body.error;
    note(path, {
      ms: performance.now() - started,
      ok: !failed,
      detail: failed ? `${response.status} ${body.error?.message ?? ""}`.replace(/s+/g, " ").slice(0, 140) : undefined,
    });
  } catch (error) {
    note(path, { ms: performance.now() - started, ok: false, detail: String(error).slice(0, 80) });
  }
}

async function seed(): Promise<string[]> {
  await db.delete(expenses).where(sql`${expenses.userId} >= ${firstId}`);
  await db.delete(localUsers).where(sql`${localUsers.id} >= ${firstId}`);
  const ids = Array.from({ length: people }, (_, index) => firstId + index);
  for (let start = 0; start < ids.length; start += 500) {
    await db.insert(localUsers).values(
      ids.slice(start, start + 500).map((id) => ({
        id,
        name: "زبون تجربة",
        phone: `0100${String(id).padStart(7, "0")}`,
        password: "not-a-login",
        plan: "free" as const,
        role: "user" as const,
      })),
    );
  }
  const categories = ["أكل وشرب", "مواصلات", "فواتير", "تسوق"];
  const rows = ids.flatMap((id) =>
    Array.from({ length: 60 }, (_, index) => ({
      userId: id,
      userType: "local" as const,
      amount: String(20 + (index % 40) * 15),
      type: "expense" as const,
      category: categories[index % categories.length],
      description: "عملية تجربة",
      source: "manual" as const,
      date: new Date(Date.now() - index * 12 * 3_600_000),
    })),
  );
  for (let start = 0; start < rows.length; start += 2000) {
    await db.insert(expenses).values(rows.slice(start, start + 2000));
  }
  const tokens: string[] = [];
  for (const id of ids) {
    const token = await generateToken(id, "local");
    await createSession(id, "local", token, { ipAddress: "127.0.0.1", userAgent: "load" });
    tokens.push(token);
  }
  return tokens;
}

async function person(tokens: string[], offset: number, until: number, month: string) {
  let step = 0;
  while (Date.now() < until) {
    const token = tokens[(offset + step) % tokens.length];
    await call(token, "localAuth.me");
    await Promise.all([
      call(token, "expense.list", { limit: 30 }),
      call(token, "expense.getMonthlyStats", { month }),
      call(token, "wallet.getWallets"),
    ]);
    step += 1;
    await call(
      token,
      "expense.create",
      {
        amount: 75,
        category: "أكل وشرب",
        description: "قهوة",
        rawText: "قهوة 75",
        clientRequestId: `${token.slice(-12)}-${step}-${Date.now()}`,
      },
      true,
    );
    // A person reads between screens; this is the short end of it.
    await new Promise((done) => setTimeout(done, 1000 + Math.random() * 2000));
  }
}

function percentile(sorted: number[], at: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * at))] ?? 0;
}

async function main() {
  const target = new URL(process.env.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "3399") {
    throw new Error("The load test needs a throwaway database on port 3399");
  }
  console.log(`Seeding ${people} people...`);
  const seedStart = Date.now();
  const tokens = await seed();
  console.log(`Seeded in ${Math.round((Date.now() - seedStart) / 1000)}s`);

  const { app } = await import("../../api/boot");
  const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
  const until = Date.now() + seconds * 1000;
  const month = new Date().toISOString().slice(0, 7);
  await Promise.all(
    Array.from({ length: concurrent }, (_, index) =>
      person(tokens, index * 7, until, month),
    ),
  );
  server.close();

  let total = 0;
  let failures = 0;
  for (const [name, list] of [...samples].sort()) {
    const sorted = list.filter((s) => s.ok).map((s) => s.ms).sort((a, b) => a - b);
    const failed = list.filter((s) => !s.ok);
    total += list.length;
    failures += failed.length;
    console.log(
      `${name.padEnd(28)} ${String(list.length).padStart(6)} calls  p50 ${percentile(sorted, 0.5).toFixed(0)}ms  ` +
        `p95 ${percentile(sorted, 0.95).toFixed(0)}ms  p99 ${percentile(sorted, 0.99).toFixed(0)}ms  failed ${failed.length}` +
        (failed[0] ? `  (${failed[0].detail})` : ""),
    );
  }
  console.log(`LOAD_DONE ${total} calls, ${failures} failed, ${(total / seconds).toFixed(0)} a second`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Load test failure:", error);
  process.exit(1);
});
