/**
 * The golden rules in AGENTS.md, checked against the facts `npm run atlas` extracts from the code. A rule with
 * known exceptions lists them beside it with the reason; those lists may only shrink.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildAtlasGraph, type AtlasGraph } from "../../scripts/atlas/graph";

const ROOT = process.cwd();
const PLAN_NAMES = ["free", "pro", "ultra"];

/** `*-router.ts` files that are not tRPC routers, so api/router.ts does not mount them. */
const NOT_TRPC_ROUTERS: Record<string, string> = {
  "api/sms-router.ts": "Hono sub-app mounted at /api/sms by api/boot.ts",
};

/**
 * Variables read straight from process.env instead of through api/lib/env.ts. Move them into env.ts and delete
 * them here; never add a name.
 */
const UNVALIDATED_ENV = [
  "AI_GATEWAY_SECRET",
  "AWS_ACCESS_KEY_ID",
  "AWS_REGION",
  "AWS_SECRET_ACCESS_KEY",
  "R2_ACCESS_KEY_ID",
  "R2_BUCKET_NAME",
  "R2_ENDPOINT",
  "R2_PUBLIC_URL",
  "R2_REGION",
  "R2_SECRET_ACCESS_KEY",
  "S3_BUCKET",
  "S3_ENDPOINT",
  "STORAGE_DRIVER",
  "STORAGE_PUBLIC_URL",
  "VAPID_PRIVATE_KEY",
  "VAPID_PUBLIC_KEY",
];

let graph: AtlasGraph;

function source(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

beforeAll(async () => {
  graph = await buildAtlasGraph();
}, 300_000);

describe("architecture rules from AGENTS.md", () => {
  it("rule 1: indexes every user-owned table on (user_id, user_type)", () => {
    const offenders = graph.database.tables
      .filter((table) => table.dualUserOwnership)
      .filter((table) => !table.indexes.some((index) => index.columns[0] === "user_id" && index.columns[1] === "user_type"))
      .map((table) => table.name);
    expect(offenders).toEqual([]);
  });

  it("rule 2: never compares a role with a plan name", () => {
    const builders = graph.api.builders
      .filter((builder) => builder.roles.some((role) => PLAN_NAMES.includes(role)))
      .map((builder) => builder.name);
    const comparison =
      /\brole\b\s*[!=]==?\s*["'](?:free|pro|ultra)["']|["'](?:free|pro|ultra)["']\s*[!=]==?\s*[\w.?]*\brole\b/;
    const files = graph.modules.map((module) => module.file).filter((file) => comparison.test(source(file)));
    expect([...builders, ...files]).toEqual([]);
  });

  it("rule 3: every procedure uses a builder exported by api/middleware.ts", () => {
    const builders = new Set(graph.api.builders.map((builder) => builder.name));
    const offenders = graph.api.routers
      .flatMap((router) => router.procedures)
      .filter((procedure) => !builders.has(procedure.builder))
      .map((procedure) => `${procedure.path} uses ${procedure.builder}`);
    expect(offenders).toEqual([]);
  });

  it("rule 3: every tRPC router file is mounted in api/router.ts", () => {
    const mounted = new Set(graph.api.routers.map((router) => router.file));
    const unmounted = fs
      .readdirSync(path.join(ROOT, "api"))
      .filter((name) => name.endsWith("-router.ts"))
      .map((name) => `api/${name}`)
      .filter((file) => !mounted.has(file) && !(file in NOT_TRPC_ROUTERS));
    expect(unmounted).toEqual([]);
  });

  it("rule 4: declares no foreign keys", () => {
    const offenders = graph.database.tables.filter((table) => table.foreignKeys > 0).map((table) => table.name);
    expect(offenders).toEqual([]);
  });

  it("rule 4: gives every table exactly one storage class", () => {
    expect(graph.database.unclassifiedTables).toEqual([]);
    expect(graph.database.orphanClassEntries).toEqual([]);
  });

  it("rule 5: invalidates the settings cache wherever system_settings is written", () => {
    const offenders = graph.modules
      .filter((module) => module.write.includes("system_settings") && module.file !== "api/lib/settings-cache.ts")
      .filter((module) => !source(module.file).includes("invalidateSettingsCache("))
      .map((module) => module.file);
    expect(offenders).toEqual([]);
  });

  it("rule 7: schedules background work only through scheduleProtectedJob", () => {
    const cronImporters = graph.modules.filter((module) => module.packages.includes("node-cron")).map((module) => module.file);
    expect(cronImporters).toEqual(["api/boot.ts"]);
    // The single call is the one inside scheduleProtectedJob, which adds the advisory lock and the ENABLE_CRONS switch.
    expect(source("api/boot.ts").match(/\bcron\.schedule\(/g) ?? []).toHaveLength(1);
    expect(graph.entrypoints.jobs.map((job) => job.file).filter((file) => file !== "api/boot.ts")).toEqual([]);
  });

  it("rule 8: reads server configuration through api/lib/env.ts", () => {
    const direct = graph.env.server.filter((variable) => !variable.declared).map((variable) => variable.name);
    expect(direct.filter((name) => !UNVALIDATED_ENV.includes(name))).toEqual([]);
  });
});

describe("layering", () => {
  it("lets the web app import only the AppRouter type from the server", () => {
    const offenders = graph.modules
      .filter((module) => module.file.startsWith("src/"))
      .flatMap((module) => [
        ...module.imports.filter((target) => /^(api|db)\//.test(target)).map((target) => `${module.file} -> ${target}`),
        ...module.typeImports
          .filter((target) => /^(api|db)\//.test(target) && target !== "api/router.ts")
          .map((target) => `${module.file} -> type ${target}`),
      ]);
    expect(offenders).toEqual([]);
  });

  it("keeps contracts free of application code (schema types excepted)", () => {
    const offenders = graph.modules
      .filter((module) => module.file.startsWith("contracts/"))
      .flatMap((module) => [
        ...module.imports.filter((target) => !target.startsWith("contracts/")).map((target) => `${module.file} -> ${target}`),
        ...module.typeImports
          .filter((target) => !target.startsWith("contracts/") && target !== "db/schema.ts")
          .map((target) => `${module.file} -> type ${target}`),
      ]);
    expect(offenders).toEqual([]);
  });

  it("keeps QA, script and scratch code out of the server runtime", () => {
    const offenders = graph.modules
      .filter((module) => module.file.startsWith("api/"))
      .flatMap((module) =>
        module.imports
          .filter((target) => /^api\/(qa|scripts)\//.test(target) || target.includes("/scratch/"))
          .map((target) => `${module.file} -> ${target}`),
      );
    expect(offenders).toEqual([]);
  });

  it("resolves every frontend call and every table without extractor warnings", () => {
    expect(graph.warnings).toEqual([]);
  });
});
