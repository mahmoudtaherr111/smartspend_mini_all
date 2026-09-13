import { SyntaxKind } from "ts-morph";
import { analyzeUsage, type FileContext, type TableLookup } from "../lib/project";
import { byKey, compareStrings, matchesGlob, uniqSorted } from "../lib/util";

export interface ClusterRule {
  id: string;
  title: string;
  description: string;
  paths: string[];
}

export interface ExternalSystem {
  id: string;
  title: string;
  kind: string;
  packages?: string[];
  hosts?: string[];
  files?: string[];
}

export interface ExternalsConfig {
  systems: ExternalSystem[];
  libraries: string[];
  ignoreHostLiteralsIn?: string[];
}

export interface ModuleFacts {
  file: string;
  cluster: string;
  imports: string[];
  typeImports: string[];
  packages: string[];
  externals: string[];
  read: string[];
  write: string[];
}

type ContextFor = (file: string) => FileContext;

function stringLiterals(ctx: FileContext): string[] {
  const sf = ctx.sf;
  return [
    ...sf.getDescendantsOfKind(SyntaxKind.StringLiteral).map((node) => node.getLiteralValue()),
    ...sf.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral).map((node) => node.getLiteralValue()),
    ...sf.getDescendantsOfKind(SyntaxKind.TemplateHead).map((node) => node.getLiteralText()),
    ...sf.getDescendantsOfKind(SyntaxKind.TemplateMiddle).map((node) => node.getLiteralText()),
    ...sf.getDescendantsOfKind(SyntaxKind.TemplateTail).map((node) => node.getLiteralText()),
  ];
}

export function extractModules(
  files: string[],
  contextFor: ContextFor,
  tables: TableLookup,
  clusters: ClusterRule[],
  externals: ExternalsConfig,
  warnings: string[],
): ModuleFacts[] {
  const packageSystem = new Map<string, string>();
  for (const system of externals.systems) {
    for (const name of system.packages ?? []) packageSystem.set(name, system.id);
  }
  const hostSystems = externals.systems.flatMap((system) =>
    (system.hosts ?? []).map((host) => ({ host, id: system.id })),
  );
  const ignoreHosts = new Set(externals.ignoreHostLiteralsIn ?? []);
  const unmapped = new Map<string, Set<string>>();

  const modules: ModuleFacts[] = [];
  for (const file of files) {
    const ctx = contextFor(file);
    const imports = new Set<string>();
    const typeImports = new Set<string>();
    const packages = new Set<string>();
    for (const edge of ctx.edges) {
      if (edge.kind === "file") {
        if (edge.file !== file) (edge.typeOnly ? typeImports : imports).add(edge.file);
      } else if (!edge.typeOnly) {
        packages.add(edge.name);
      }
    }
    for (const value of imports) typeImports.delete(value);

    const systems = new Set<string>();
    for (const name of packages) {
      const system = packageSystem.get(name);
      if (system) {
        systems.add(system);
      } else if (!matchesGlob(name, externals.libraries)) {
        if (!unmapped.has(name)) unmapped.set(name, new Set());
        unmapped.get(name)!.add(file);
      }
    }
    if (!ignoreHosts.has(file)) {
      const literals = stringLiterals(ctx);
      for (const { host, id } of hostSystems) {
        if (literals.some((literal) => literal.includes(`//${host}`))) systems.add(id);
      }
    }
    for (const system of externals.systems) {
      if (system.files?.includes(file)) systems.add(system.id);
    }

    const cluster = clusters.find((rule) => matchesGlob(file, rule.paths))?.id ?? "unclustered";
    if (cluster === "unclustered") {
      warnings.push(`Unclustered file — add a rule to docs/architecture/clusters.json: ${file}`);
    }

    const usage = analyzeUsage(ctx.sf, ctx, tables);
    modules.push({
      file,
      cluster,
      imports: uniqSorted(imports),
      typeImports: uniqSorted(typeImports),
      packages: uniqSorted(packages),
      externals: uniqSorted(systems),
      read: uniqSorted(usage.read),
      write: uniqSorted(usage.write),
    });
  }

  for (const [name, users] of [...unmapped.entries()].sort((a, b) => compareStrings(a[0], b[0]))) {
    warnings.push(
      `Unmapped package "${name}" — classify it in docs/architecture/externals.json (imported by ${uniqSorted(users).join(", ")})`,
    );
  }
  return modules.sort(byKey((module) => module.file));
}
