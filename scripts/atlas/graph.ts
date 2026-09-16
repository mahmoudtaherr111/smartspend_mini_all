import fs from "node:fs";
import path from "node:path";
import { buildFileContext, createProject, isRuntimeFile, type FileContext } from "./lib/project";
import { REPO_ROOT, rel, uniqSorted } from "./lib/util";
import { buildTableLookup, extractDatabase, type DatabaseFacts } from "./extract/database";
import { extractApi, type ApiFacts } from "./extract/api";
import { extractEntrypoints, type EntrypointFacts } from "./extract/entrypoints";
import { extractFrontend, type FrontendFacts } from "./extract/frontend";
import {
  extractModules,
  type ClusterRule,
  type ExternalsConfig,
  type ModuleFacts,
} from "./extract/modules";
import { extractEnv, type EnvFacts } from "./extract/env";
import { extractSystems, type SystemsFacts } from "./extract/systems";

export interface AtlasGraph {
  database: DatabaseFacts;
  api: ApiFacts;
  entrypoints: EntrypointFacts;
  frontend: FrontendFacts;
  modules: ModuleFacts[];
  clusters: ClusterRule[];
  externals: ExternalsConfig;
  env: EnvFacts;
  systems: SystemsFacts;
  warnings: string[];
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8")) as T;
}

/**
 * Builds every fact the atlas publishes. Only db/*.ts is imported at runtime (Drizzle needs the
 * real table objects); api/ and src/ are analysed statically, because importing them would run
 * the Zod environment validation in api/lib/env.ts.
 */
export async function buildAtlasGraph(): Promise<AtlasGraph> {
  const warnings: string[] = [];
  const database = await extractDatabase();
  const tables = buildTableLookup(database);
  const project = createProject();

  const contexts = new Map<string, FileContext>();
  const contextFor = (file: string): FileContext => {
    let ctx = contexts.get(file);
    if (!ctx) {
      const absolute = path.join(REPO_ROOT, file);
      const sourceFile = project.getSourceFile(absolute) ?? project.addSourceFileAtPath(absolute);
      ctx = buildFileContext(sourceFile);
      contexts.set(file, ctx);
    }
    return ctx;
  };

  const api = extractApi(contextFor, tables, warnings);
  const entrypoints = extractEntrypoints(contextFor, tables, warnings);
  const frontend = extractFrontend(contextFor);
  const clusters = readJson<{ clusters: ClusterRule[] }>("docs/architecture/clusters.json").clusters;
  const externals = readJson<ExternalsConfig>("docs/architecture/externals.json");

  const runtimeFiles = uniqSorted(
    project
      .getSourceFiles()
      .map((sourceFile) => rel(sourceFile.getFilePath()))
      .filter(isRuntimeFile),
  );
  const modules = extractModules(runtimeFiles, contextFor, tables, clusters, externals, warnings);
  const env = extractEnv(runtimeFiles, contextFor, warnings);
  const systems = extractSystems({ api, entrypoints, frontend, clusters, modules }, warnings);

  const routerKeys = new Set(api.routers.map((router) => router.key));
  const procedurePaths = new Set(api.routers.flatMap((router) => router.procedures.map((p) => p.path)));
  for (const call of frontend.calls) {
    if (!routerKeys.has(call.router)) {
      warnings.push(`${call.file}: calls unknown tRPC router "${call.router}".`);
    } else if (call.procedure && !procedurePaths.has(`${call.router}.${call.procedure}`)) {
      warnings.push(`${call.file}: calls unknown tRPC procedure "${call.router}.${call.procedure}".`);
    }
  }
  for (const name of database.unclassifiedTables) {
    warnings.push(`Table "${name}" has no storage class in db/table-classes.ts.`);
  }
  for (const name of database.orphanClassEntries) {
    warnings.push(`db/table-classes.ts classifies "${name}", which is not a table in db/schema.ts.`);
  }

  // Line numbers shift on every edit; keeping them out of committed output avoids needless churn.
  const stableWarnings = warnings.map((warning) => warning.replace(/(\.tsx?):\d+:/g, "$1:"));
  return {
    database,
    api,
    entrypoints,
    frontend,
    modules,
    clusters,
    externals,
    env,
    systems,
    warnings: uniqSorted(stableWarnings),
  };
}
