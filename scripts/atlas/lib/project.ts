import fs from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";
import { Node, Project, SyntaxKind, type SourceFile } from "ts-morph";
import { REPO_ROOT, rel } from "./util";

export type ImportTarget =
  | { kind: "file"; file: string; importedName: string; typeOnly: boolean }
  | { kind: "package"; name: string; typeOnly: boolean };

export interface FileContext {
  sf: SourceFile;
  /** Repository-relative POSIX path. */
  file: string;
  /** Local identifier → what it was imported from (static and `await import()` bindings). */
  imports: Map<string, ImportTarget>;
  /** Every import edge, including side-effect, re-export and dynamic imports. */
  edges: ImportTarget[];
  /** Top-level functions and function-valued constants, followed when a scope calls them. */
  localFunctions: Map<string, Node>;
}

export interface TableLookup {
  schemaFile: string;
  /** Export name in db/schema.ts → SQL table name. */
  exportToTable: Map<string, string>;
  tableNames: Set<string>;
}

export interface Usage {
  files: Set<string>;
  packages: Set<string>;
  read: Set<string>;
  write: Set<string>;
}

const BUILTINS = new Set(builtinModules);
const EXTENSIONS = ["", ".ts", ".tsx", ".json", "/index.ts", "/index.tsx"];
const WRITE_METHODS = new Set(["insert", "update", "delete"]);
const READ_METHODS = new Set(["from", "innerJoin", "leftJoin", "rightJoin", "fullJoin", "crossJoin"]);
const QUERY_METHODS = new Set(["findFirst", "findMany"]);

export function createProject(): Project {
  return new Project({
    tsConfigFilePath: path.join(REPO_ROOT, "tsconfig.server.json"),
    skipFileDependencyResolution: true,
  });
}

export function emptyUsage(): Usage {
  return { files: new Set(), packages: new Set(), read: new Set(), write: new Set() };
}

function isRepoFile(relPath: string): boolean {
  try {
    return fs.statSync(path.join(REPO_ROOT, relPath)).isFile();
  } catch {
    return false;
  }
}

/** Resolves relative and aliased specifiers (`@/`, `@contracts/`, `@db/`) to repository files. */
export function resolveSpecifier(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith(".")) {
    base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  } else if (specifier.startsWith("@/")) {
    base = `src/${specifier.slice(2)}`;
  } else if (specifier.startsWith("@contracts/")) {
    base = `contracts/${specifier.slice("@contracts/".length)}`;
  } else if (specifier.startsWith("@db/")) {
    base = `db/${specifier.slice("@db/".length)}`;
  } else {
    return null;
  }
  const bases = base.endsWith(".js") ? [base, base.slice(0, -3)] : [base];
  for (const candidateBase of bases) {
    for (const extension of EXTENSIONS) {
      const candidate = `${candidateBase}${extension}`;
      if (isRepoFile(candidate)) return candidate;
    }
  }
  return null;
}

/** npm package name for a bare specifier; null for builtins, virtual modules and relative paths. */
export function packageName(specifier: string): string | null {
  if (specifier.startsWith(".") || specifier.startsWith("node:") || specifier.includes(":")) return null;
  const parts = specifier.split("/");
  const name = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  if (!name || BUILTINS.has(name)) return null;
  return name;
}

export function literalValue(node: Node | undefined): string | null {
  if (!node) return null;
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return node.getLiteralValue();
  }
  return null;
}

export function buildFileContext(sf: SourceFile): FileContext {
  const file = rel(sf.getFilePath());
  const imports = new Map<string, ImportTarget>();
  const edges: ImportTarget[] = [];

  const add = (specifier: string, importedName: string, local: string | null, typeOnly: boolean) => {
    const resolved = resolveSpecifier(file, specifier);
    let target: ImportTarget | null = null;
    if (resolved) {
      target = { kind: "file", file: resolved, importedName, typeOnly };
    } else {
      const name = packageName(specifier);
      if (name) target = { kind: "package", name, typeOnly };
    }
    if (!target) return;
    edges.push(target);
    if (local) imports.set(local, target);
  };

  for (const declaration of sf.getImportDeclarations()) {
    const specifier = declaration.getModuleSpecifierValue();
    const typeOnly = declaration.isTypeOnly();
    const defaultImport = declaration.getDefaultImport();
    const namespaceImport = declaration.getNamespaceImport();
    const namedImports = declaration.getNamedImports();
    if (!defaultImport && !namespaceImport && namedImports.length === 0) {
      add(specifier, "*", null, typeOnly);
    }
    if (defaultImport) add(specifier, "default", defaultImport.getText(), typeOnly);
    if (namespaceImport) add(specifier, "*", namespaceImport.getText(), typeOnly);
    for (const named of namedImports) {
      const local = named.getAliasNode()?.getText() ?? named.getName();
      add(specifier, named.getName(), local, typeOnly || named.isTypeOnly());
    }
  }

  for (const declaration of sf.getExportDeclarations()) {
    const specifier = declaration.getModuleSpecifierValue();
    if (specifier) add(specifier, "*", null, declaration.isTypeOnly());
  }

  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) continue;
    const specifier = literalValue(call.getArguments()[0]);
    if (!specifier) continue;
    const holder = call.getParentIfKind(SyntaxKind.AwaitExpression) ?? call;
    const declaration = holder.getParentIfKind(SyntaxKind.VariableDeclaration);
    const nameNode = declaration?.getNameNode();
    if (nameNode && Node.isObjectBindingPattern(nameNode)) {
      for (const element of nameNode.getElements()) {
        const imported = element.getPropertyNameNode()?.getText() ?? element.getNameNode().getText();
        add(specifier, imported, element.getNameNode().getText(), false);
      }
    } else if (nameNode && Node.isIdentifier(nameNode)) {
      add(specifier, "*", nameNode.getText(), false);
    } else {
      add(specifier, "*", null, false);
    }
  }

  const localFunctions = new Map<string, Node>();
  for (const fn of sf.getFunctions()) {
    const name = fn.getName();
    if (name) localFunctions.set(name, fn);
  }
  for (const declaration of sf.getVariableDeclarations()) {
    const initializer = declaration.getInitializer();
    if (initializer && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))) {
      localFunctions.set(declaration.getName(), initializer);
    }
  }

  return { sf, file, imports, edges, localFunctions };
}

/** True when an identifier refers to a binding (not a property name, key or import clause). */
function isReference(identifier: Node): boolean {
  const parent = identifier.getParent();
  if (!parent) return true;
  if (Node.isPropertyAccessExpression(parent)) return parent.getNameNode() !== identifier;
  if (Node.isPropertyAssignment(parent)) return parent.getNameNode() !== identifier;
  if (Node.isPropertySignature(parent) || Node.isPropertyDeclaration(parent) || Node.isMethodDeclaration(parent)) {
    return parent.getNameNode() !== identifier;
  }
  if (Node.isBindingElement(parent)) return parent.getPropertyNameNode() !== identifier;
  if (Node.isImportSpecifier(parent) || Node.isImportClause(parent) || Node.isNamespaceImport(parent)) return false;
  if (Node.isJsxAttribute(parent)) return false;
  return true;
}

export function tableForIdentifier(ctx: FileContext, tables: TableLookup, name: string): string | null {
  const target = ctx.imports.get(name);
  if (!target || target.kind !== "file" || target.file !== tables.schemaFile) return null;
  return tables.exportToTable.get(target.importedName) ?? null;
}

const declarationsByScope = new WeakMap<Node, Map<string, Node[]>>();

function declarationsIn(scope: Node): Map<string, Node[]> {
  let map = declarationsByScope.get(scope);
  if (!map) {
    map = new Map();
    for (const declaration of scope.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      const name = declaration.getName();
      const list = map.get(name) ?? [];
      list.push(declaration);
      map.set(name, list);
    }
    declarationsByScope.set(scope, map);
  }
  return map;
}

/**
 * Tables an argument can stand for: a direct schema import, or a local constant chosen from schema
 * imports such as `const table = user.type === "oauth" ? users : localUsers`.
 */
export function tablesForArgument(identifier: Node, ctx: FileContext, tables: TableLookup): string[] {
  const name = identifier.getText();
  const direct = tableForIdentifier(ctx, tables, name);
  if (direct) return [direct];

  const found = new Set<string>();
  let current: Node | undefined = identifier.getParent();
  while (current && found.size === 0) {
    const isScope =
      Node.isFunctionDeclaration(current) ||
      Node.isArrowFunction(current) ||
      Node.isFunctionExpression(current) ||
      Node.isMethodDeclaration(current) ||
      Node.isSourceFile(current);
    if (isScope) {
      for (const declaration of declarationsIn(current).get(name) ?? []) {
        if (!Node.isVariableDeclaration(declaration)) continue;
        const initializer = declaration.getInitializer();
        if (!initializer) continue;
        for (const candidate of [initializer, ...initializer.getDescendantsOfKind(SyntaxKind.Identifier)]) {
          if (!Node.isIdentifier(candidate)) continue;
          const table = tableForIdentifier(ctx, tables, candidate.getText());
          if (table) found.add(table);
        }
      }
    }
    current = current.getParent();
  }
  return [...found];
}

function scanSql(text: string, tables: TableLookup, usage: Usage): void {
  const writeStarts = new Set<number>();
  const writePattern = /\b(?:insert\s+(?:ignore\s+)?into|replace\s+into|update|delete\s+from)\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?/gi;
  for (const match of text.matchAll(writePattern)) {
    if (!tables.tableNames.has(match[1])) continue;
    usage.write.add(match[1]);
    writeStarts.add(match.index ?? -1);
  }
  const readPattern = /\b(from|join)\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?/gi;
  for (const match of text.matchAll(readPattern)) {
    if (!tables.tableNames.has(match[2])) continue;
    const before = text.slice(0, match.index ?? 0);
    if (/delete\s+$/i.test(before)) continue;
    usage.read.add(match[2]);
  }
}

/**
 * Collects what a syntax scope depends on: repository files, npm packages and the tables it
 * reads or writes. Top-level helper functions of the same file are followed once.
 */
export function analyzeUsage(
  root: Node,
  ctx: FileContext,
  tables: TableLookup,
  usage: Usage = emptyUsage(),
  visited: Set<Node> = new Set(),
): Usage {
  if (visited.has(root)) return usage;
  visited.add(root);

  const visit = (node: Node) => {
    if (Node.isIdentifier(node)) {
      if (!isReference(node)) return;
      const name = node.getText();
      const target = ctx.imports.get(name);
      if (target) {
        if (!target.typeOnly) {
          if (target.kind === "file") usage.files.add(target.file);
          else usage.packages.add(target.name);
        }
        return;
      }
      const local = ctx.localFunctions.get(name);
      if (local && !local.containsRange(node.getPos(), node.getEnd())) {
        analyzeUsage(local, ctx, tables, usage, visited);
      }
      return;
    }

    if (Node.isCallExpression(node)) {
      const callee = node.getExpression();
      if (callee.getKind() === SyntaxKind.ImportKeyword) {
        const specifier = literalValue(node.getArguments()[0]);
        if (specifier) {
          const resolved = resolveSpecifier(ctx.file, specifier);
          if (resolved) usage.files.add(resolved);
          else {
            const name = packageName(specifier);
            if (name) usage.packages.add(name);
          }
        }
        return;
      }
      if (callee.getText() === "sql.raw") {
        scanSql(node.getArguments()[0]?.getText() ?? "", tables, usage);
      }
      if (Node.isPropertyAccessExpression(callee)) {
        const method = callee.getName();
        const first = node.getArguments()[0];
        if (first && Node.isIdentifier(first) && (WRITE_METHODS.has(method) || READ_METHODS.has(method))) {
          for (const table of tablesForArgument(first, ctx, tables)) {
            if (WRITE_METHODS.has(method)) usage.write.add(table);
            else usage.read.add(table);
          }
        }
        if (QUERY_METHODS.has(method)) {
          const owner = callee.getExpression();
          if (Node.isPropertyAccessExpression(owner)) {
            const holder = owner.getExpression();
            if (Node.isPropertyAccessExpression(holder) && holder.getName() === "query") {
              const table = tables.exportToTable.get(owner.getName());
              if (table) usage.read.add(table);
            }
          }
        }
      }
      return;
    }

    if (Node.isTaggedTemplateExpression(node)) {
      if (node.getTag().getText() === "sql") scanSql(node.getTemplate().getText(), tables, usage);
      return;
    }

    if (Node.isPropertyAssignment(node) && node.getName() === "tableName") {
      const value = literalValue(node.getInitializer());
      if (value && tables.tableNames.has(value)) usage.write.add(value);
    }
  };

  visit(root);
  root.forEachDescendant(visit);
  return usage;
}

/** Walks `a.b(...).c(...)` down to its leftmost expression. */
export function chainRoot(node: Node): Node {
  let current = node;
  while (Node.isCallExpression(current) || Node.isPropertyAccessExpression(current)) {
    current = current.getExpression();
  }
  return current;
}

/** `trpc.expense.create.useMutation` → ["trpc", "expense", "create", "useMutation"]. */
export function propertyChain(node: Node): string[] | null {
  const parts: string[] = [];
  let current: Node = node;
  while (Node.isPropertyAccessExpression(current)) {
    parts.unshift(current.getName());
    current = current.getExpression();
  }
  if (!Node.isIdentifier(current)) return null;
  parts.unshift(current.getText());
  return parts;
}

export function isRuntimeFile(file: string): boolean {
  if (!/\.(ts|tsx)$/.test(file) || file.endsWith(".d.ts")) return false;
  if (/\.(test|spec|stress\.test)\.tsx?$/.test(file)) return false;
  if (
    file.startsWith("api/qa/") ||
    file.startsWith("api/scripts/") ||
    file.includes("/scratch/") ||
    file.includes("__mocks__") ||
    file.includes("__baselines__")
  ) {
    return false;
  }
  return ["api/", "src/", "db/", "contracts/"].some((prefix) => file.startsWith(prefix));
}
