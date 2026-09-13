import { Node, SyntaxKind } from "ts-morph";
import { literalValue, propertyChain, type FileContext } from "../lib/project";
import { compareStrings, uniqSorted } from "../lib/util";

export interface EnvVarInfo {
  name: string;
  declared: boolean;
  required: boolean;
  defaultValue: string | null;
  usedBy: string[];
}

export interface EnvFacts {
  schemaFile: string;
  server: EnvVarInfo[];
  frontend: Array<{ name: string; usedBy: string[] }>;
}

type ContextFor = (file: string) => FileContext;

export function extractEnv(files: string[], contextFor: ContextFor, warnings: string[]): EnvFacts {
  const schemaFile = "api/lib/env.ts";
  const schemaCtx = contextFor(schemaFile);
  const declared = new Map<string, { required: boolean; defaultValue: string | null }>();

  const objectCall = schemaCtx.sf
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => call.getExpression().getText() === "z.object");
  const objectLiteral = objectCall?.getArguments()[0];
  if (!objectLiteral || !Node.isObjectLiteralExpression(objectLiteral)) {
    warnings.push(`${schemaFile}: could not find the z.object({...}) environment schema.`);
  } else {
    for (const property of objectLiteral.getProperties()) {
      if (!Node.isPropertyAssignment(property)) continue;
      const initializer = property.getInitializerOrThrow();
      let optional = false;
      let defaultValue: string | null = null;
      const calls = [initializer, ...initializer.getDescendantsOfKind(SyntaxKind.CallExpression)];
      for (const call of calls) {
        if (!Node.isCallExpression(call)) continue;
        const callee = call.getExpression();
        if (!Node.isPropertyAccessExpression(callee)) continue;
        if (callee.getName() === "optional") optional = true;
        if (callee.getName() === "default") {
          const argument = call.getArguments()[0];
          defaultValue = literalValue(argument) ?? argument?.getText() ?? null;
        }
      }
      declared.set(property.getName(), { required: !optional && defaultValue === null, defaultValue });
    }
  }

  const serverUses = new Map<string, Set<string>>();
  const frontendUses = new Map<string, Set<string>>();
  const record = (map: Map<string, Set<string>>, name: string, file: string) => {
    if (!map.has(name)) map.set(name, new Set());
    map.get(name)!.add(file);
  };

  const envLocalsFor = (ctx: FileContext) =>
    new Set(
      [...ctx.imports.entries()]
        .filter(([, target]) => target.kind === "file" && target.file === schemaFile && target.importedName === "env")
        .map(([local]) => local),
    );

  // Files that receive the whole validated env object, e.g. createOriginPolicy(env), read its
  // fields through their own parameter name; those reads count as uses too.
  const envConsumers = new Set<string>();
  for (const file of files) {
    const ctx = contextFor(file);
    const envLocals = envLocalsFor(ctx);
    if (envLocals.size === 0) continue;
    for (const call of ctx.sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (!call.getArguments().some((argument) => envLocals.has(argument.getText()))) continue;
      const callee = call.getExpression();
      const calleeName = Node.isIdentifier(callee)
        ? callee.getText()
        : Node.isPropertyAccessExpression(callee)
          ? propertyChain(callee)?.[0]
          : undefined;
      if (!calleeName) continue;
      const target = ctx.imports.get(calleeName);
      if (target?.kind === "file") envConsumers.add(target.file);
      else if (ctx.localFunctions.has(calleeName)) envConsumers.add(file);
    }
    for (const declaration of ctx.sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      const initializer = declaration.getInitializer();
      const nameNode = declaration.getNameNode();
      if (!initializer || !envLocals.has(initializer.getText()) || !Node.isObjectBindingPattern(nameNode)) continue;
      for (const element of nameNode.getElements()) {
        record(serverUses, element.getPropertyNameNode()?.getText() ?? element.getNameNode().getText(), file);
      }
    }
  }

  for (const file of files) {
    const ctx = contextFor(file);
    const isFrontend = file.startsWith("src/");
    const envLocals = envLocalsFor(ctx);
    for (const access of ctx.sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
      const owner = access.getExpression().getText();
      const name = access.getName();
      if (owner === "import.meta.env") record(frontendUses, name, file);
      else if (owner === "process.env") record(isFrontend ? frontendUses : serverUses, name, file);
      else if (envLocals.has(owner) && file !== schemaFile) record(serverUses, name, file);
      else if (!isFrontend && envConsumers.has(file) && declared.has(name) && file !== schemaFile) {
        record(serverUses, name, file);
      }
    }
    for (const access of ctx.sf.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)) {
      const key = literalValue(access.getArgumentExpression());
      if (!key) continue;
      const owner = access.getExpression().getText();
      if (owner === "process.env") record(isFrontend ? frontendUses : serverUses, key, file);
      else if (isFrontend && /^VITE_[A-Z0-9_]+$/.test(key)) record(frontendUses, key, file);
    }
  }

  const serverNames = uniqSorted([...declared.keys(), ...serverUses.keys()]);
  const server: EnvVarInfo[] = serverNames.map((name) => ({
    name,
    declared: declared.has(name),
    required: declared.get(name)?.required ?? false,
    defaultValue: declared.get(name)?.defaultValue ?? null,
    usedBy: uniqSorted(serverUses.get(name) ?? []),
  }));
  const frontend = [...frontendUses.entries()]
    .map(([name, users]) => ({ name, usedBy: uniqSorted(users) }))
    .sort((a, b) => compareStrings(a.name, b.name));

  return { schemaFile, server, frontend };
}
