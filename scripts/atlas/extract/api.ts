import { Node, SyntaxKind, type ObjectLiteralExpression } from "ts-morph";
import {
  analyzeUsage,
  chainRoot,
  type FileContext,
  type TableLookup,
} from "../lib/project";
import { byKey, evalNumericExpression, uniqSorted } from "../lib/util";

export interface RateLimitInfo {
  limiter: string;
  max: number | null;
  windowMs: number | null;
}

export interface BuilderInfo {
  name: string;
  extends: string | null;
  rateLimits: RateLimitInfo[];
  /** Role and plan string literals the builder compares `ctx.user` against. */
  roles: string[];
  plans: string[];
  requiresUser: boolean;
  line: number;
}

export interface ProcedureInfo {
  path: string;
  name: string;
  builder: string;
  kind: string;
  hasInput: boolean;
  file: string;
  line: number;
  uses: string[];
  packages: string[];
  read: string[];
  write: string[];
}

export interface RouterInfo {
  key: string;
  exportName: string;
  file: string;
  procedures: ProcedureInfo[];
}

export interface ApiFacts {
  middlewareFile: string;
  rootFile: string;
  builders: BuilderInfo[];
  routers: RouterInfo[];
}

type ContextFor = (file: string) => FileContext;

const PROCEDURE_KINDS = new Set(["query", "mutation", "subscription"]);

function firstObjectArgument(node: Node | undefined): ObjectLiteralExpression | null {
  if (!node || !Node.isCallExpression(node)) return null;
  const argument = node.getArguments()[0];
  return argument && Node.isObjectLiteralExpression(argument) ? argument : null;
}

function extractBuilders(ctx: FileContext): BuilderInfo[] {
  const limiters = new Map<string, { max: number | null; windowMs: number | null }>();
  for (const declaration of ctx.sf.getVariableDeclarations()) {
    const initializer = declaration.getInitializer();
    if (
      initializer &&
      Node.isCallExpression(initializer) &&
      initializer.getExpression().getText() === "createRateLimiter"
    ) {
      const [max, windowMs] = initializer.getArguments();
      limiters.set(declaration.getName(), {
        max: evalNumericExpression(max?.getText()),
        windowMs: evalNumericExpression(windowMs?.getText()),
      });
    }
  }

  const builders: BuilderInfo[] = [];
  for (const declaration of ctx.sf.getVariableDeclarations()) {
    const name = declaration.getName();
    const initializer = declaration.getInitializer();
    if (!name.endsWith("Procedure") || !declaration.isExported() || !initializer) continue;
    const root = chainRoot(initializer).getText();
    const roles = new Set<string>();
    const plans = new Set<string>();
    for (const binary of initializer.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
      const match = binary.getText().match(/ctx\.user\.(role|plan)\s*[!=]==?\s*["']([a-z_]+)["']/);
      if (match) (match[1] === "role" ? roles : plans).add(match[2]);
    }
    const usedLimiters = uniqSorted(
      initializer
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .map((identifier) => identifier.getText())
        .filter((text) => limiters.has(text)),
    );
    builders.push({
      name,
      extends: root !== "t" && root.endsWith("Procedure") ? root : null,
      rateLimits: usedLimiters.map((limiter) => ({ limiter, ...limiters.get(limiter)! })),
      roles: uniqSorted(roles),
      plans: uniqSorted(plans),
      requiresUser: /!ctx\.user\b/.test(initializer.getText()),
      line: declaration.getStartLineNumber(),
    });
  }
  return builders.sort(byKey((builder) => builder.name));
}

function collectProcedures(
  object: ObjectLiteralExpression,
  prefix: string,
  ctx: FileContext,
  tables: TableLookup,
  out: ProcedureInfo[],
  warnings: string[],
): void {
  for (const property of object.getProperties()) {
    if (!Node.isPropertyAssignment(property)) {
      warnings.push(
        `${ctx.file}:${property.getStartLineNumber()}: router member "${property.getText().slice(0, 40)}" is not a plain property; the generator cannot read it.`,
      );
      continue;
    }
    const name = property.getName();
    const initializer = property.getInitializerOrThrow();

    if (Node.isCallExpression(initializer) && initializer.getExpression().getText() === "router") {
      const nested = firstObjectArgument(initializer);
      if (nested) collectProcedures(nested, `${prefix}.${name}`, ctx, tables, out, warnings);
      continue;
    }

    let kind = "unknown";
    if (Node.isCallExpression(initializer)) {
      const callee = initializer.getExpression();
      if (Node.isPropertyAccessExpression(callee)) kind = callee.getName();
    }
    if (!PROCEDURE_KINDS.has(kind)) {
      warnings.push(`${ctx.file}:${property.getStartLineNumber()}: procedure "${prefix}.${name}" does not end in .query/.mutation/.subscription.`);
    }

    let hasInput = false;
    let current: Node = initializer;
    while (Node.isCallExpression(current) || Node.isPropertyAccessExpression(current)) {
      if (Node.isPropertyAccessExpression(current) && current.getName() === "input") hasInput = true;
      current = current.getExpression();
    }

    const usage = analyzeUsage(initializer, ctx, tables);
    out.push({
      path: `${prefix}.${name}`,
      name,
      builder: current.getText(),
      kind,
      hasInput,
      file: ctx.file,
      line: property.getStartLineNumber(),
      uses: uniqSorted([...usage.files].filter((file) => file !== ctx.file)),
      packages: uniqSorted(usage.packages),
      read: uniqSorted(usage.read),
      write: uniqSorted(usage.write),
    });
  }
}

export function extractApi(contextFor: ContextFor, tables: TableLookup, warnings: string[]): ApiFacts {
  const middlewareFile = "api/middleware.ts";
  const rootFile = "api/router.ts";
  const builders = extractBuilders(contextFor(middlewareFile));
  const builderNames = new Set(builders.map((builder) => builder.name));

  const rootCtx = contextFor(rootFile);
  const appRouter = rootCtx.sf.getVariableDeclaration("appRouter");
  const rootObject = firstObjectArgument(appRouter?.getInitializer());
  if (!rootObject) {
    warnings.push(`${rootFile}: could not find \`export const appRouter = router({...})\`.`);
    return { middlewareFile, rootFile, builders, routers: [] };
  }

  const routers: RouterInfo[] = [];
  for (const property of rootObject.getProperties()) {
    if (!Node.isPropertyAssignment(property) && !Node.isShorthandPropertyAssignment(property)) continue;
    const key = property.getName();
    const valueName = Node.isPropertyAssignment(property)
      ? property.getInitializerOrThrow().getText()
      : key;
    const target = rootCtx.imports.get(valueName);
    if (!target || target.kind !== "file") {
      warnings.push(`${rootFile}: router "${key}" is not an imported identifier.`);
      continue;
    }
    const routerCtx = contextFor(target.file);
    const declaration = routerCtx.sf.getVariableDeclaration(target.importedName);
    const routerObject = firstObjectArgument(declaration?.getInitializer());
    if (!routerObject) {
      warnings.push(`${target.file}: "${target.importedName}" is not declared as router({...}).`);
      continue;
    }
    const procedures: ProcedureInfo[] = [];
    collectProcedures(routerObject, key, routerCtx, tables, procedures, warnings);
    for (const procedure of procedures) {
      if (!builderNames.has(procedure.builder)) {
        warnings.push(`${procedure.file}:${procedure.line}: procedure "${procedure.path}" uses "${procedure.builder}", which is not a builder exported by ${middlewareFile}.`);
      }
    }
    routers.push({
      key,
      exportName: target.importedName,
      file: target.file,
      procedures: procedures.sort(byKey((procedure) => procedure.path)),
    });
  }

  return { middlewareFile, rootFile, builders, routers: routers.sort(byKey((router) => router.key)) };
}
