import { Node, SyntaxKind } from "ts-morph";
import {
  analyzeUsage,
  emptyUsage,
  literalValue,
  type FileContext,
  type TableLookup,
} from "../lib/project";
import { byKey, compareStrings, uniqSorted } from "../lib/util";

export interface RouteInfo {
  method: string;
  path: string;
  kind: "http" | "trpc" | "sse" | "webhook";
  file: string;
  line: number;
  uses: string[];
}

export interface MiddlewareInfo {
  path: string;
  handler: string;
  file: string;
  line: number;
}

export interface JobInfo {
  name: string;
  schedule: string;
  file: string;
  line: number;
  uses: string[];
  read: string[];
  write: string[];
}

export interface WebSocketInfo {
  pathPrefix: string;
  handler: string;
  handlerFile: string | null;
  file: string;
  line: number;
}

export interface EntrypointFacts {
  appFile: string;
  routes: RouteInfo[];
  middleware: MiddlewareInfo[];
  jobs: JobInfo[];
  websockets: WebSocketInfo[];
  /** Environment switches the entry file checks before starting background work. */
  switches: string[];
}

type ContextFor = (file: string) => FileContext;

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "all"]);
const SERVER_FILES = ["api/boot.ts", "api/server.ts"];
const INFRA = new Set(["api/queries/connection.ts", "db/schema.ts"]);

function describeHandler(node: Node | undefined): string {
  if (!node) return "?";
  if (Node.isCallExpression(node)) return `${node.getExpression().getText()}()`;
  if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) return "inline handler";
  return node.getText();
}

function routeKind(path: string): RouteInfo["kind"] {
  if (path.includes("/webhooks/")) return "webhook";
  if (path.includes("/sse/")) return "sse";
  return "http";
}

function cleanUses(files: Iterable<string>, self: string): string[] {
  return uniqSorted([...files].filter((file) => file !== self && !INFRA.has(file)));
}

function subAppRoutes(
  ctx: FileContext,
  variable: string,
  prefix: string,
  tables: TableLookup,
): RouteInfo[] {
  const routes: RouteInfo[] = [];
  for (const call of ctx.sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee) || callee.getExpression().getText() !== variable) continue;
    const method = callee.getName();
    const path = literalValue(call.getArguments()[0]);
    if (!HTTP_METHODS.has(method) || path === null) continue;
    const handler = call.getArguments().at(-1);
    const usage = handler ? analyzeUsage(handler, ctx, tables) : emptyUsage();
    const fullPath = `${prefix}${path}`;
    routes.push({
      method: method.toUpperCase(),
      path: fullPath,
      kind: routeKind(fullPath),
      file: ctx.file,
      line: call.getStartLineNumber(),
      uses: cleanUses(usage.files, ctx.file),
    });
  }
  return routes;
}

export function extractEntrypoints(
  contextFor: ContextFor,
  tables: TableLookup,
  warnings: string[],
): EntrypointFacts {
  const appFile = "api/boot.ts";
  const ctx = contextFor(appFile);
  const routes: RouteInfo[] = [];
  const middleware: MiddlewareInfo[] = [];
  const jobs: JobInfo[] = [];

  for (const call of ctx.sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    const args = call.getArguments();

    if (Node.isIdentifier(callee) && args[0]?.getText() === "app") {
      middleware.push({ path: "*", handler: `${callee.getText()}(app)`, file: appFile, line: call.getStartLineNumber() });
      continue;
    }

    if (Node.isIdentifier(callee) && callee.getText() === "scheduleProtectedJob") {
      const schedule = literalValue(args[0]);
      const name = literalValue(args[1]);
      if (schedule === null || name === null) {
        warnings.push(`${appFile}:${call.getStartLineNumber()}: scheduleProtectedJob call without literal schedule/name.`);
        continue;
      }
      const usage = args[2] ? analyzeUsage(args[2], ctx, tables) : emptyUsage();
      jobs.push({
        name,
        schedule,
        file: appFile,
        line: call.getStartLineNumber(),
        uses: cleanUses(usage.files, appFile),
        read: uniqSorted(usage.read),
        write: uniqSorted(usage.write),
      });
      continue;
    }

    if (Node.isIdentifier(callee) && callee.getText() === "withScheduledJobLock") {
      const insideRegistrar = call.getFirstAncestor(
        (ancestor) => Node.isFunctionDeclaration(ancestor) && ancestor.getName() === "scheduleProtectedJob",
      );
      if (insideRegistrar) continue;
      const name = literalValue(args[0]);
      if (name === null) continue;
      const usage = args[1] ? analyzeUsage(args[1], ctx, tables) : emptyUsage();
      jobs.push({
        name,
        schedule: "once at boot",
        file: appFile,
        line: call.getStartLineNumber(),
        uses: cleanUses(usage.files, appFile),
        read: uniqSorted(usage.read),
        write: uniqSorted(usage.write),
      });
      continue;
    }

    if (!Node.isPropertyAccessExpression(callee) || callee.getExpression().getText() !== "app") continue;
    const method = callee.getName();
    const path = literalValue(args[0]);

    if (method === "onError" || method === "notFound") {
      middleware.push({ path: method, handler: describeHandler(args[0]), file: appFile, line: call.getStartLineNumber() });
      continue;
    }
    if (path === null) continue;

    if (method === "use") {
      const handler = args[1];
      if (handler && Node.isCallExpression(handler) && handler.getExpression().getText() === "trpcServer") {
        routes.push({
          method: "ALL",
          path,
          kind: "trpc",
          file: appFile,
          line: call.getStartLineNumber(),
          uses: ["api/router.ts"],
        });
      } else {
        middleware.push({ path, handler: describeHandler(handler), file: appFile, line: call.getStartLineNumber() });
      }
      continue;
    }

    if (method === "route") {
      const target = args[1] ? ctx.imports.get(args[1].getText()) : undefined;
      if (!target || target.kind !== "file") {
        warnings.push(`${appFile}:${call.getStartLineNumber()}: app.route("${path}") mounts something that is not an imported sub-app.`);
        continue;
      }
      routes.push(...subAppRoutes(contextFor(target.file), target.importedName, path, tables));
      continue;
    }

    if (HTTP_METHODS.has(method)) {
      const handler = args.at(-1);
      const usage = handler ? analyzeUsage(handler, ctx, tables) : emptyUsage();
      routes.push({
        method: method.toUpperCase(),
        path,
        kind: routeKind(path),
        file: appFile,
        line: call.getStartLineNumber(),
        uses: cleanUses(usage.files, appFile),
      });
    }
  }

  const websockets: WebSocketInfo[] = [];
  for (const file of SERVER_FILES) {
    const serverCtx = contextFor(file);
    const handlerNames = uniqSorted(
      serverCtx.sf
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .map((identifier) => identifier.getText())
        .filter((text) => /^handle\w*WebSocket$/.test(text)),
    );
    for (const call of serverCtx.sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression();
      if (!Node.isPropertyAccessExpression(callee) || callee.getName() !== "on") continue;
      const [event, callback] = call.getArguments();
      if (literalValue(event) !== "upgrade" || !callback) continue;
      const prefixes = callback
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter((inner) => {
          const innerCallee = inner.getExpression();
          return Node.isPropertyAccessExpression(innerCallee) && innerCallee.getName() === "startsWith";
        })
        .map((inner) => literalValue(inner.getArguments()[0]))
        .filter((value): value is string => value !== null);
      for (const pathPrefix of prefixes) {
        const handlerTarget = handlerNames[0] ? serverCtx.imports.get(handlerNames[0]) : undefined;
        websockets.push({
          pathPrefix,
          handler: handlerNames.join(", ") || "?",
          handlerFile: handlerTarget?.kind === "file" ? handlerTarget.file : null,
          file,
          line: call.getStartLineNumber(),
        });
      }
    }
  }

  const text = ctx.sf.getFullText();
  const switches = ["ENABLE_CRONS", "ENABLE_WHATSAPP"].filter((name) => text.includes(name));

  return {
    appFile,
    routes: routes.sort((a, b) => compareStrings(a.path, b.path) || compareStrings(a.method, b.method)),
    middleware: middleware.sort((a, b) => a.line - b.line),
    jobs: jobs.sort(byKey((job) => job.name)),
    websockets: websockets.sort((a, b) => compareStrings(a.file, b.file) || compareStrings(a.pathPrefix, b.pathPrefix)),
    switches,
  };
}
