/**
 * The architecture rules in AGENTS.md, evaluated on the facts `npm run atlas` extracts from the code.
 * A rule with known exceptions lists them beside it with the reason; those lists may only shrink.
 *
 * Shared by tests/knowledge/architecture.test.ts and `npm run agent:finish`.
 */
import fs from "node:fs";
import path from "node:path";
import type { AtlasGraph } from "../atlas/graph";
import { REPO_ROOT } from "../atlas/lib/util";
import { unparenthesizedOrFragments } from "./sql-fragments";
import type { RuleResult } from "./types";

const PLAN_NAMES = ["free", "pro", "ultra"];
const PURGE_SERVICE = "api/services/user-purge-service.ts";

/** `*-router.ts` files that are not tRPC routers, so api/router.ts does not mount them. */
const NOT_TRPC_ROUTERS: Record<string, string> = {
  "api/sms-router.ts": "Hono sub-app mounted at /api/sms by api/boot.ts",
};

/**
 * Variables read straight from process.env instead of through api/lib/env.ts. Move them into env.ts and
 * delete them here; never add a name.
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

const ROLE_COMPARED_WITH_PLAN =
  /\brole\b\s*[!=]==?\s*["'](?:free|pro|ultra)["']|["'](?:free|pro|ultra)["']\s*[!=]==?\s*[\w.?]*\brole\b/;

interface RuleDefinition {
  id: string;
  title: string;
  fix: string;
  check: (graph: AtlasGraph, root: string) => string[];
}

function source(root: string, file: string): string {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const RULES: RuleDefinition[] = [
  {
    id: "user-tables-indexed",
    title: "rule 1: every user-owned table has an index that starts with (user_id, user_type)",
    fix: "Add index(\"<table>_user_idx\").on(t.userId, t.userType) to the table in db/schema.ts.",
    check: (graph) =>
      graph.database.tables
        .filter((table) => table.dualUserOwnership)
        .filter((table) => !table.indexes.some((index) => index.columns[0] === "user_id" && index.columns[1] === "user_type"))
        .map((table) => table.name),
  },
  {
    id: "user-tables-purged",
    title: "rule 1: deleting an account removes the rows of every user-owned table",
    fix: `Delete the table's rows for the user in purgeUserData (${PURGE_SERVICE}).`,
    check: (graph) => {
      const written = new Set(graph.modules.find((module) => module.file === PURGE_SERVICE)?.write ?? []);
      return graph.database.tables
        .filter((table) => table.dualUserOwnership && !written.has(table.name))
        .map((table) => table.name);
    },
  },
  {
    id: "role-not-plan",
    title: "rule 2: a role is never compared with a plan name",
    fix: "Compare ctx.user.plan with the plan name, or use proProcedure / ultraProcedure from api/middleware.ts.",
    check: (graph, root) => [
      ...graph.api.builders
        .filter((builder) => builder.roles.some((role) => PLAN_NAMES.includes(role)))
        .map((builder) => `${graph.api.middlewareFile}: ${builder.name}`),
      ...graph.modules.map((module) => module.file).filter((file) => ROLE_COMPARED_WITH_PLAN.test(source(root, file))),
    ],
  },
  {
    id: "builders-known",
    title: "rule 3: every procedure uses a builder exported by api/middleware.ts",
    fix: "Build the procedure from one of the exports of api/middleware.ts.",
    check: (graph) => {
      const builders = new Set(graph.api.builders.map((builder) => builder.name));
      return graph.api.routers
        .flatMap((router) => router.procedures)
        .filter((procedure) => !builders.has(procedure.builder))
        .map((procedure) => `${procedure.path} uses ${procedure.builder}`);
    },
  },
  {
    id: "routers-mounted",
    title: "rule 3: every tRPC router file is mounted in api/router.ts",
    fix: "Mount the router in api/router.ts, or delete the file if nothing uses it.",
    check: (graph, root) => {
      const mounted = new Set(graph.api.routers.map((router) => router.file));
      return fs
        .readdirSync(path.join(root, "api"))
        .filter((name) => name.endsWith("-router.ts"))
        .map((name) => `api/${name}`)
        .filter((file) => !mounted.has(file) && !(file in NOT_TRPC_ROUTERS));
    },
  },
  {
    id: "no-foreign-keys",
    title: "rule 4: the schema declares no foreign keys",
    fix: "Remove the foreign key, declare the relation in db/relations.ts and keep integrity in code (docs/decisions/0002).",
    check: (graph) => graph.database.tables.filter((table) => table.foreignKeys > 0).map((table) => table.name),
  },
  {
    id: "storage-classes",
    title: "rule 4: every table has exactly one storage class",
    fix: "Add the table to db/table-classes.ts, or remove the entry of a table that no longer exists.",
    check: (graph) => [
      ...graph.database.unclassifiedTables.map((name) => `no storage class: ${name}`),
      ...graph.database.orphanClassEntries.map((name) => `classified but not a table: ${name}`),
    ],
  },
  {
    id: "settings-writes-invalidate",
    title: "rule 5: code that writes system_settings invalidates the settings cache",
    fix: "Call invalidateSettingsCache() from api/lib/settings-cache.ts after the write.",
    check: (graph, root) =>
      graph.modules
        .filter((module) => module.write.includes("system_settings") && module.file !== "api/lib/settings-cache.ts")
        .filter((module) => !source(root, module.file).includes("invalidateSettingsCache("))
        .map((module) => module.file),
  },
  {
    id: "jobs-protected",
    title: "rule 7: background work is scheduled only through scheduleProtectedJob",
    fix: "Register the job with scheduleProtectedJob in api/boot.ts instead of calling node-cron directly.",
    check: (graph, root) => {
      const problems = graph.modules
        .filter((module) => module.packages.includes("node-cron") && module.file !== "api/boot.ts")
        .map((module) => `${module.file} imports node-cron`);
      // The single call is the one inside scheduleProtectedJob, which adds the advisory lock and ENABLE_CRONS.
      const calls = (source(root, "api/boot.ts").match(/\bcron\.schedule\(/g) ?? []).length;
      if (calls !== 1) problems.push(`api/boot.ts calls cron.schedule ${calls} times; only scheduleProtectedJob may`);
      return [
        ...problems,
        ...graph.entrypoints.jobs.filter((job) => job.file !== "api/boot.ts").map((job) => `${job.file}: ${job.name}`),
      ];
    },
  },
  {
    id: "env-validated",
    title: "rule 8: server configuration is read through api/lib/env.ts",
    fix: "Declare the variable in api/lib/env.ts and read it from `env`.",
    check: (graph) =>
      graph.env.server
        .filter((variable) => !variable.declared && !UNVALIDATED_ENV.includes(variable.name))
        .map((variable) => `${variable.name} (${variable.usedBy.join(", ")})`),
  },
  {
    id: "sql-or-parenthesized",
    title: "api/AGENTS.md rule 3: a raw sql fragment keeps its OR inside parentheses",
    fix: "Build the alternatives with or(...) from drizzle-orm, or put them in parentheses inside the fragment: and() does not parenthesize its arguments.",
    check: (graph, root) =>
      graph.modules
        .filter((module) => module.file.startsWith("api/"))
        .flatMap((module) => unparenthesizedOrFragments(module.file, source(root, module.file))),
  },
  {
    id: "web-imports-types-only",
    title: "the web app imports only the AppRouter type from the server",
    fix: "Call the API through trpc.<router>.<procedure>; move code both sides need into contracts/.",
    check: (graph) =>
      graph.modules
        .filter((module) => module.file.startsWith("src/"))
        .flatMap((module) => [
          ...module.imports.filter((target) => /^(api|db)\//.test(target)).map((target) => `${module.file} -> ${target}`),
          ...module.typeImports
            .filter((target) => /^(api|db)\//.test(target) && target !== "api/router.ts")
            .map((target) => `${module.file} -> type ${target}`),
        ]),
  },
  {
    id: "contracts-standalone",
    title: "contracts import nothing from the application, schema types excepted",
    fix: "Move what the contract needs into contracts/, or import it as a type from db/schema.ts.",
    check: (graph) =>
      graph.modules
        .filter((module) => module.file.startsWith("contracts/"))
        .flatMap((module) => [
          ...module.imports.filter((target) => !target.startsWith("contracts/")).map((target) => `${module.file} -> ${target}`),
          ...module.typeImports
            .filter((target) => !target.startsWith("contracts/") && target !== "db/schema.ts")
            .map((target) => `${module.file} -> type ${target}`),
        ]),
  },
  {
    id: "runtime-excludes-qa",
    title: "QA, script and scratch code stay out of the server runtime",
    fix: "Move the helper into api/lib or api/services, or keep the import inside tests and scripts.",
    check: (graph) =>
      graph.modules
        .filter((module) => module.file.startsWith("api/"))
        .flatMap((module) =>
          module.imports
            .filter((target) => /^api\/(qa|scripts)\//.test(target) || target.includes("/scratch/"))
            .map((target) => `${module.file} -> ${target}`),
        ),
  },
  {
    id: "clusters-match-files",
    title: "every module rule in docs/architecture/clusters.json points at files that exist",
    fix: "Correct or remove the stale path in docs/architecture/clusters.json.",
    check: (graph, root) => {
      const used = new Set(graph.modules.map((module) => module.cluster));
      return graph.clusters.flatMap((cluster) => [
        ...(used.has(cluster.id) ? [] : [`${cluster.id}: matches no runtime file`]),
        ...cluster.paths
          .filter((rulePath) => !/[*?]/.test(rulePath) && !fs.existsSync(path.join(root, rulePath)))
          .map((rulePath) => `${cluster.id}: ${rulePath} does not exist`),
      ]);
    },
  },
  {
    id: "externals-resolve",
    title: "every outside system in docs/architecture/externals.json names installed packages and existing files",
    fix: "Correct the system's packages or files in docs/architecture/externals.json.",
    check: (graph, root) => {
      const manifest = JSON.parse(source(root, "package.json")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const installed = { ...manifest.dependencies, ...manifest.devDependencies };
      return graph.externals.systems.flatMap((system) => [
        ...(system.packages ?? []).filter((name) => !installed[name]).map((name) => `${system.id}: package ${name} is not installed`),
        ...(system.files ?? []).filter((file) => !fs.existsSync(path.join(root, file))).map((file) => `${system.id}: ${file} does not exist`),
      ]);
    },
  },
  {
    id: "extractor-warnings",
    title: "the atlas resolves every frontend call, table and runtime file without warnings",
    fix: "Read the warning (also listed in docs/atlas/README.md) and fix the code or the map it names.",
    check: (graph) => graph.warnings,
  },
];

/** Rule metadata without the checks, so tests can name one test per rule before the graph is built. */
export const ARCHITECTURE_RULES = RULES.map(({ id, title, fix }) => ({ id, title, fix }));

export function checkArchitecture(graph: AtlasGraph, root = REPO_ROOT): RuleResult[] {
  return RULES.map(({ id, title, fix, check }) => ({ id, title, fix, violations: check(graph, root) }));
}
