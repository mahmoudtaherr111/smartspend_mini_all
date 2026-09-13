import { Node, SyntaxKind, type SourceFile } from "ts-morph";
import { literalValue, propertyChain, resolveSpecifier, type FileContext } from "../lib/project";
import { byKey, compareStrings, uniqSorted } from "../lib/util";

export interface TrpcCall {
  router: string;
  procedure: string | null;
  method: string;
  file: string;
  line: number;
}

export interface BrowserRoute {
  path: string;
  access: string;
  component: string | null;
  pageFile: string | null;
  redirect: string | null;
  line: number;
}

export interface PageFacts {
  name: string;
  file: string;
  files: string[];
  calls: TrpcCall[];
}

export interface FrontendFacts {
  appFile: string;
  routes: BrowserRoute[];
  pages: PageFacts[];
  shell: PageFacts;
  calls: TrpcCall[];
  /** `useMutation` hooks assigned to a variable nothing else in the file references; not counted as calls. */
  unusedMutations: TrpcCall[];
}

interface FileHooks {
  calls: TrpcCall[];
  unusedMutations: TrpcCall[];
}

type ContextFor = (file: string) => FileContext;

const ROUTE_GUARDS: Record<string, string> = {
  ProtectedRoute: "signed-in",
  AdminRoute: "admin",
  PublicOnlyRoute: "signed-out only",
};
const HOOKS = new Set([
  "useQuery",
  "useMutation",
  "useInfiniteQuery",
  "useSuspenseQuery",
  "useSuspenseInfiniteQuery",
  "usePrefetchQuery",
  "useSubscription",
]);
const CACHE_OPERATIONS = new Set([
  "invalidate",
  "fetch",
  "prefetch",
  "setData",
  "getData",
  "refetch",
  "cancel",
  "ensureData",
  "reset",
  "setInfiniteData",
  "getInfiniteData",
  "fetchInfinite",
  "prefetchInfinite",
]);
const TRPC_PROVIDER = "src/providers/trpc.ts";
const UI_PRIMITIVES = "src/components/ui/";

function jsxTagNames(node: Node): string[] {
  const names: string[] = [];
  for (const element of node.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) {
    names.push(element.getTagNameNode().getText());
  }
  for (const element of node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
    names.push(element.getTagNameNode().getText());
  }
  return names;
}

function jsxAttribute(element: Node, name: string): Node | undefined {
  if (!Node.isJsxSelfClosingElement(element) && !Node.isJsxOpeningElement(element)) return undefined;
  for (const attribute of element.getAttributes()) {
    if (Node.isJsxAttribute(attribute) && attribute.getNameNode().getText() === name) {
      const initializer = attribute.getInitializer();
      if (initializer && Node.isJsxExpression(initializer)) return initializer.getExpression();
      return initializer;
    }
  }
  return undefined;
}

function lazyPages(ctx: FileContext): Map<string, string> {
  const pages = new Map<string, string>();
  for (const declaration of ctx.sf.getVariableDeclarations()) {
    const initializer = declaration.getInitializer();
    if (!initializer || !Node.isCallExpression(initializer) || initializer.getExpression().getText() !== "lazy") continue;
    const dynamicImport = initializer
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .find((call) => call.getExpression().getKind() === SyntaxKind.ImportKeyword);
    const specifier = literalValue(dynamicImport?.getArguments()[0]);
    const file = specifier ? resolveSpecifier(ctx.file, specifier) : null;
    if (file) pages.set(declaration.getName(), file);
  }
  return pages;
}

function localComponentBody(sf: SourceFile, name: string): Node | undefined {
  return sf.getFunction(name) ?? sf.getVariableDeclaration(name)?.getInitializer();
}

function extractRoutes(ctx: FileContext, pages: Map<string, string>): BrowserRoute[] {
  const routes: BrowserRoute[] = [];
  const elements = [
    ...ctx.sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ...ctx.sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
  ];
  for (const element of elements) {
    if (element.getTagNameNode().getText() !== "Route") continue;
    const path = literalValue(jsxAttribute(element, "path"));
    const routeElement = jsxAttribute(element, "element");
    if (path === null || !routeElement) continue;

    const tags = [
      ...(Node.isJsxElement(routeElement) || Node.isJsxSelfClosingElement(routeElement)
        ? [
            Node.isJsxElement(routeElement)
              ? routeElement.getOpeningElement().getTagNameNode().getText()
              : routeElement.getTagNameNode().getText(),
          ]
        : []),
      ...jsxTagNames(routeElement),
    ];
    const guard = tags.find((tag) => ROUTE_GUARDS[tag]);
    let component = tags.find((tag) => pages.has(tag)) ?? null;
    if (!component) {
      for (const tag of tags) {
        const body = localComponentBody(ctx.sf, tag);
        const inner = body ? jsxTagNames(body).find((innerTag) => pages.has(innerTag)) : undefined;
        if (inner) {
          component = inner;
          break;
        }
      }
    }
    let redirect: string | null = null;
    const navigate = [routeElement, ...routeElement.getDescendants()].find(
      (node) =>
        (Node.isJsxSelfClosingElement(node) || Node.isJsxOpeningElement(node)) &&
        node.getTagNameNode().getText() === "Navigate",
    );
    if (navigate) redirect = literalValue(jsxAttribute(navigate, "to"));

    routes.push({
      path,
      access: guard ? ROUTE_GUARDS[guard] : "public",
      component,
      pageFile: component ? pages.get(component) ?? null : null,
      redirect,
      line: element.getStartLineNumber(),
    });
  }
  return routes.sort((a, b) => compareStrings(a.path, b.path));
}

/** The variable a `trpc.x.y.useMutation()` call is assigned to, when it is a plain identifier. */
function mutationVariable(access: Node): string | null {
  const call = access.getParent();
  if (!call || !Node.isCallExpression(call)) return null;
  const callee = call.getExpression();
  if (callee.getStart() !== access.getStart() || callee.getEnd() !== access.getEnd()) return null;
  const declaration = call.getParent();
  if (!declaration || !Node.isVariableDeclaration(declaration)) return null;
  const nameNode = declaration.getNameNode();
  return Node.isIdentifier(nameNode) ? nameNode.getText() : null;
}

function identifierCounts(ctx: FileContext): Map<string, number> {
  const counts = new Map<string, number>();
  for (const identifier of ctx.sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const text = identifier.getText();
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  return counts;
}

/**
 * A mutation hook sends nothing until `mutate` is called, so a hook whose variable is never used
 * again is not a caller. Query hooks are different: they fetch on mount, so they always count.
 */
function hooksInFile(ctx: FileContext): FileHooks {
  const trpcNames = new Set<string>();
  for (const [local, target] of ctx.imports) {
    if (target.kind === "file" && target.file === TRPC_PROVIDER && target.importedName === "trpc") trpcNames.add(local);
  }
  if (trpcNames.size === 0) return { calls: [], unusedMutations: [] };

  const utilsNames = new Set<string>();
  for (const declaration of ctx.sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const text = declaration.getInitializer()?.getText().replace(/\s/g, "");
    if (!text) continue;
    for (const name of trpcNames) {
      if (text === `${name}.useUtils()` || text === `${name}.useContext()`) utilsNames.add(declaration.getName());
    }
  }

  let counts: Map<string, number> | null = null;
  const calls: TrpcCall[] = [];
  const unusedMutations: TrpcCall[] = [];
  for (const access of ctx.sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    const parent = access.getParent();
    if (parent && Node.isPropertyAccessExpression(parent) && parent.getExpression() === access) continue;
    const parts = propertyChain(access);
    if (!parts) continue;
    const line = access.getStartLineNumber();
    if (trpcNames.has(parts[0]) && parts.length === 4 && HOOKS.has(parts[3])) {
      const call = { router: parts[1], procedure: parts[2], method: parts[3], file: ctx.file, line };
      const variable = parts[3] === "useMutation" ? mutationVariable(access) : null;
      if (variable) {
        counts ??= identifierCounts(ctx);
        if ((counts.get(variable) ?? 0) <= 1) {
          unusedMutations.push(call);
          continue;
        }
      }
      calls.push(call);
    } else if (utilsNames.has(parts[0]) && parts.length === 4 && CACHE_OPERATIONS.has(parts[3])) {
      calls.push({ router: parts[1], procedure: parts[2], method: `utils.${parts[3]}`, file: ctx.file, line });
    } else if (utilsNames.has(parts[0]) && parts.length === 3 && CACHE_OPERATIONS.has(parts[2])) {
      calls.push({ router: parts[1], procedure: null, method: `utils.${parts[2]}`, file: ctx.file, line });
    }
  }
  return { calls, unusedMutations };
}

function closure(start: string[], contextFor: ContextFor, excluded: Set<string>): string[] {
  const seen = new Set<string>();
  const queue = [...start];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const edge of contextFor(file).edges) {
      if (edge.kind !== "file" || edge.typeOnly) continue;
      if (!edge.file.startsWith("src/") || edge.file.startsWith(UI_PRIMITIVES) || excluded.has(edge.file)) continue;
      if (!/\.(ts|tsx)$/.test(edge.file) || /\.test\.tsx?$/.test(edge.file)) continue;
      if (!seen.has(edge.file)) queue.push(edge.file);
    }
  }
  return [...seen].sort(compareStrings);
}

export function extractFrontend(contextFor: ContextFor): FrontendFacts {
  const appFile = "src/App.tsx";
  const appCtx = contextFor(appFile);
  const pages = lazyPages(appCtx);
  const routes = extractRoutes(appCtx, pages);
  const hookCache = new Map<string, FileHooks>();
  const hooksFor = (file: string) => {
    let hooks = hookCache.get(file);
    if (!hooks) {
      hooks = hooksInFile(contextFor(file));
      hookCache.set(file, hooks);
    }
    return hooks;
  };
  const callsFor = (file: string) => hooksFor(file).calls;

  const pageFiles = new Set(pages.values());
  const shellFiles = closure([appFile], contextFor, pageFiles);
  const shell: PageFacts = {
    name: "App shell",
    file: appFile,
    files: shellFiles,
    calls: shellFiles.flatMap(callsFor),
  };

  const pageFacts: PageFacts[] = [...pages.entries()]
    .map(([name, file]) => {
      const files = closure([file], contextFor, new Set());
      return { name, file, files, calls: files.flatMap(callsFor) };
    })
    .sort(byKey((page) => page.name));

  const everyFile = uniqSorted([...shellFiles, ...pageFacts.flatMap((page) => page.files)]);
  return {
    appFile,
    routes,
    pages: pageFacts,
    shell,
    calls: everyFile.flatMap(callsFor),
    unusedMutations: everyFile.flatMap((file) => hooksFor(file).unusedMutations),
  };
}
