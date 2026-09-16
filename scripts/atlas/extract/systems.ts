/**
 * Systems: the map in docs/architecture/systems.json from the code to the parts people think in (recording
 * spending, bank messages, the AI Center, ...). Every cluster, tRPC procedure, page, HTTP route, WebSocket,
 * scheduled job and drawn flow belongs to exactly one system; a procedure belongs to its router's system unless
 * another system lists it. Each gap or double claim becomes a generator warning, which the knowledge rules fail on.
 *
 * It also works out the source code each system's explanation describes (its coverage), so that a change to that
 * code asks for the explanation to be checked again (scripts/knowledge/systems-docs.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, compareStrings, globToRegExp, uniqSorted } from "../lib/util";
import type { ApiFacts } from "./api";
import type { EntrypointFacts } from "./entrypoints";
import type { FrontendFacts } from "./frontend";
import type { ClusterRule, ModuleFacts } from "./modules";

export const SYSTEMS_FILE = "docs/architecture/systems.json";
const FLOWS_DIR = "docs/architecture/flows";
/** Files that register the routes and jobs of every system; the rest of their code is their own module's wiring. */
const ENTRY_FILES = new Set(["api/boot.ts", "api/server.ts"]);
/** Names the part of a split file outside its procedures, routes and jobs. */
export const REST_OF_FILE = "rest-of-file";
/** Folders never searched for extra paths: dependencies and build output. */
const WALK_SKIP = new Set(["node_modules", ".git", "build", "dist", ".gradle", ".idea"]);

interface SystemConfig {
  id: string;
  title: string;
  titleAr: string;
  summary: string;
  summaryAr: string;
  clusters?: string[];
  routers?: string[];
  procedures?: string[];
  pages?: string[];
  routes?: string[];
  websockets?: string[];
  jobs?: string[];
  flows?: string[];
  /** Globs of files the TypeScript analysis cannot see, such as the Android companion, that the explanation describes. */
  extraPaths?: string[];
}

/**
 * A piece of source code a system's explanation describes. Most files are one unit. A file whose procedures,
 * routes or jobs belong to several systems is split: each declaration is a unit of the system that owns it, and
 * the rest of the file a unit of all of them (of the file's own module, for api/boot.ts and api/server.ts).
 */
export interface CoverageUnit {
  /** `file`, `file#<procedure, route, job:name or ws:path>`, or `file#rest-of-file`. */
  id: string;
  file: string;
  /** Lines of one declaration, 1-based and inclusive. */
  lines?: [number, number];
  /** Lines of the file's declarations, left out of the rest of the file. */
  cut?: Array<[number, number]>;
}

export interface SystemFacts {
  id: string;
  title: string;
  titleAr: string;
  summary: string;
  summaryAr: string;
  clusters: string[];
  procedures: string[];
  pages: string[];
  /** `METHOD path` of HTTP routes. */
  routes: string[];
  websockets: string[];
  jobs: string[];
  flows: string[];
  /** Runtime files of the system's clusters. */
  files: string[];
  /** The source docs/systems/<id>.md describes; a change to any unit asks for a new check of that page. */
  coverage: CoverageUnit[];
}

export interface SystemsFacts {
  systems: SystemFacts[];
  /** The system that owns each item. */
  owner: {
    cluster: Map<string, string>;
    procedure: Map<string, string>;
    page: Map<string, string>;
    route: Map<string, string>;
    websocket: Map<string, string>;
    job: Map<string, string>;
    flow: Map<string, string>;
    file: Map<string, string>;
  };
}

export const routeKey = (route: { method: string; path: string }): string => `${route.method} ${route.path}`;

/** The ids of the dynamic views drawn in docs/architecture/flows. */
export function readFlowIds(root = REPO_ROOT): string[] {
  const dir = path.join(root, FLOWS_DIR);
  if (!fs.existsSync(dir)) return [];
  return uniqSorted(
    fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".c4"))
      .flatMap((name) =>
        [...fs.readFileSync(path.join(dir, name), "utf8").matchAll(/dynamic\s+view\s+([\w-]+)/g)].map((match) => match[1]),
      ),
  );
}

/** Repository files matching a glob, found by walking from the folders the glob fixes before its first wildcard. */
function filesMatching(glob: string): string[] {
  const segments = glob.split("/");
  const firstWildcard = segments.findIndex((segment) => /[*?]/.test(segment));
  const base = (firstWildcard === -1 ? segments : segments.slice(0, firstWildcard)).join("/");
  if (!base || !fs.existsSync(path.join(REPO_ROOT, base))) return [];
  const pattern = globToRegExp(glob);
  const found: string[] = [];
  const walk = (relative: string) => {
    const absolute = path.join(REPO_ROOT, relative);
    if (fs.statSync(absolute).isFile()) {
      if (pattern.test(relative)) found.push(relative);
      return;
    }
    for (const name of fs.readdirSync(absolute)) {
      if (!WALK_SKIP.has(name)) walk(`${relative}/${name}`);
    }
  };
  walk(base);
  return uniqSorted(found);
}

/**
 * Which units of source each system's explanation describes. Files are claimed through what they declare before
 * they are claimed through their module: a router file belongs to the systems of its procedures, a page file to the
 * system of its page and a job body to the system of its job, not to the platform or app shell module around them.
 */
function coverageOf(
  input: { api: ApiFacts; entrypoints: EntrypointFacts; frontend: FrontendFacts; modules: ModuleFacts[] },
  owner: SystemsFacts["owner"],
): Map<string, CoverageUnit[]> {
  const units = new Map<string, Map<string, CoverageUnit>>();
  const add = (system: string | undefined, unit: CoverageUnit) => {
    if (!system) return;
    const own = units.get(system) ?? new Map<string, CoverageUnit>();
    own.set(unit.id, unit);
    units.set(system, own);
  };
  const claimed = new Set<string>();

  const declarations = [
    ...input.api.routers.flatMap((router) =>
      router.procedures.map((procedure) => ({
        key: procedure.path,
        owner: owner.procedure.get(procedure.path),
        file: procedure.file,
        lines: [procedure.line, procedure.endLine] as [number, number],
      })),
    ),
    ...input.entrypoints.routes.map((route) => ({
      key: routeKey(route),
      owner: owner.route.get(routeKey(route)),
      file: route.file,
      lines: [route.line, route.endLine] as [number, number],
    })),
    ...input.entrypoints.jobs.map((job) => ({
      key: `job:${job.name}`,
      owner: owner.job.get(job.name),
      file: job.file,
      lines: [job.line, job.endLine] as [number, number],
    })),
    ...input.entrypoints.websockets.map((socket) => ({
      key: `ws:${socket.pathPrefix}`,
      owner: owner.websocket.get(socket.pathPrefix),
      file: socket.file,
      lines: [socket.line, socket.endLine] as [number, number],
    })),
  ];
  const byFile = new Map<string, typeof declarations>();
  for (const declaration of declarations) byFile.set(declaration.file, [...(byFile.get(declaration.file) ?? []), declaration]);

  for (const file of [...byFile.keys()].sort(compareStrings)) {
    const items = byFile.get(file)!;
    claimed.add(file);
    const owners = uniqSorted(items.map((item) => item.owner).filter((id): id is string => Boolean(id)));
    if (!ENTRY_FILES.has(file) && owners.length === 1) {
      add(owners[0], { id: file, file });
      continue;
    }
    for (const item of items) add(item.owner, { id: `${file}#${item.key}`, file, lines: item.lines });
    const cut = items.map((item) => item.lines).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const system of ENTRY_FILES.has(file) ? [owner.file.get(file)] : owners) {
      add(system, { id: `${file}#${REST_OF_FILE}`, file, cut });
    }
  }

  for (const page of [input.frontend.shell, ...input.frontend.pages]) {
    claimed.add(page.file);
    add(owner.page.get(page.name), { id: page.file, file: page.file });
  }
  for (const job of input.entrypoints.jobs) {
    for (const file of job.uses.filter((used) => used.startsWith("api/jobs/"))) {
      claimed.add(file);
      add(owner.job.get(job.name), { id: file, file });
    }
  }
  for (const socket of input.entrypoints.websockets) {
    if (!socket.handlerFile) continue;
    claimed.add(socket.handlerFile);
    add(owner.websocket.get(socket.pathPrefix), { id: socket.handlerFile, file: socket.handlerFile });
  }
  for (const module of input.modules) {
    if (!claimed.has(module.file)) add(owner.file.get(module.file), { id: module.file, file: module.file });
  }

  return new Map([...units].map(([system, own]) => [system, [...own.values()].sort((a, b) => compareStrings(a.id, b.id))]));
}

export function extractSystems(
  input: {
    api: ApiFacts;
    entrypoints: EntrypointFacts;
    frontend: FrontendFacts;
    clusters: ClusterRule[];
    modules: ModuleFacts[];
  },
  warnings: string[],
): SystemsFacts {
  const configPath = path.join(REPO_ROOT, SYSTEMS_FILE);
  const configs: SystemConfig[] = fs.existsSync(configPath)
    ? (JSON.parse(fs.readFileSync(configPath, "utf8")) as { systems: SystemConfig[] }).systems
    : [];
  const warn = (message: string) => warnings.push(`${SYSTEMS_FILE}: ${message}`);
  if (configs.length === 0) warn("no systems are defined.");

  const procedures = input.api.routers.flatMap((router) =>
    router.procedures.map((procedure) => ({ path: procedure.path, router: router.key })),
  );
  const known = {
    cluster: new Set(input.clusters.map((cluster) => cluster.id)),
    router: new Set(input.api.routers.map((router) => router.key)),
    procedure: new Set(procedures.map((procedure) => procedure.path)),
    page: new Set([input.frontend.shell.name, ...input.frontend.pages.map((page) => page.name)]),
    route: new Set(input.entrypoints.routes.map(routeKey)),
    websocket: new Set(input.entrypoints.websockets.map((socket) => socket.pathPrefix)),
    job: new Set(input.entrypoints.jobs.map((job) => job.name)),
    flow: new Set(readFlowIds()),
  };
  type Kind = keyof typeof known;
  const listOf: Record<Kind, keyof SystemConfig> = {
    cluster: "clusters",
    router: "routers",
    procedure: "procedures",
    page: "pages",
    route: "routes",
    websocket: "websockets",
    job: "jobs",
    flow: "flows",
  };
  const claims = Object.fromEntries((Object.keys(known) as Kind[]).map((kind) => [kind, new Map<string, string>()])) as Record<
    Kind,
    Map<string, string>
  >;

  const ids = new Set<string>();
  for (const system of configs) {
    if (ids.has(system.id)) warn(`the system id "${system.id}" is used twice.`);
    if (system.id === "README" || system.id === "files") warn(`the system id "${system.id}" is the name of an index page.`);
    ids.add(system.id);
    for (const kind of Object.keys(known) as Kind[]) {
      for (const item of (system[listOf[kind]] as string[] | undefined) ?? []) {
        if (!known[kind].has(item)) {
          warn(`${system.id} lists the ${kind} "${item}", which does not exist.`);
          continue;
        }
        const previous = claims[kind].get(item);
        if (previous && previous !== system.id) warn(`the ${kind} "${item}" belongs to both ${previous} and ${system.id}.`);
        else claims[kind].set(item, system.id);
      }
    }
  }

  const procedureOwner = new Map<string, string>();
  for (const procedure of procedures) {
    const owner = claims.procedure.get(procedure.path) ?? claims.router.get(procedure.router);
    if (owner) procedureOwner.set(procedure.path, owner);
    else warn(`the procedure "${procedure.path}" belongs to no system.`);
  }
  for (const kind of ["cluster", "page", "route", "websocket", "job", "flow"] as const) {
    for (const item of known[kind]) {
      if (!claims[kind].has(item)) warn(`the ${kind} "${item}" belongs to no system.`);
    }
  }

  const fileOwner = new Map<string, string>();
  for (const module of input.modules) {
    const owner = claims.cluster.get(module.cluster);
    if (owner) fileOwner.set(module.file, owner);
  }

  const owner: SystemsFacts["owner"] = {
    cluster: claims.cluster,
    procedure: procedureOwner,
    page: claims.page,
    route: claims.route,
    websocket: claims.websocket,
    job: claims.job,
    flow: claims.flow,
    file: fileOwner,
  };
  const coverage = coverageOf(input, owner);
  for (const system of configs) {
    for (const glob of system.extraPaths ?? []) {
      const files = filesMatching(glob);
      if (files.length === 0) warn(`${system.id} lists the extra path "${glob}", which matches no file.`);
      const units = new Map((coverage.get(system.id) ?? []).map((unit) => [unit.id, unit]));
      for (const file of files) units.set(file, { id: file, file });
      coverage.set(system.id, [...units.values()].sort((a, b) => compareStrings(a.id, b.id)));
    }
  }
  const ownedBy = (map: Map<string, string>, id: string) =>
    uniqSorted([...map].filter(([, itemOwner]) => itemOwner === id).map(([item]) => item));
  return {
    systems: configs.map((system) => ({
      id: system.id,
      title: system.title,
      titleAr: system.titleAr,
      summary: system.summary,
      summaryAr: system.summaryAr,
      clusters: ownedBy(claims.cluster, system.id),
      procedures: ownedBy(procedureOwner, system.id),
      pages: ownedBy(claims.page, system.id),
      routes: ownedBy(claims.route, system.id),
      websockets: ownedBy(claims.websocket, system.id),
      jobs: ownedBy(claims.job, system.id),
      flows: ownedBy(claims.flow, system.id),
      files: ownedBy(fileOwner, system.id),
      coverage: coverage.get(system.id) ?? [],
    })),
    owner,
  };
}
