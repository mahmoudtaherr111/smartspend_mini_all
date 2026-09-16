/**
 * Finds writes that change what a signed-in user may do, outside the module that owns them.
 *
 * A resolved principal is cached for up to fifteen minutes and invalidated by an auth-version counter
 * (`api/lib/session-validation.ts`). Changing a role or a plan, or ending a session, without bumping that
 * counter leaves the old access alive for the rest of the window — which is how a revoked session kept
 * answering, a removed role kept working and an expired subscriber kept a paid plan.
 *
 * `api/lib/access-control.ts` performs those writes together with the invalidation, so this rule is the other
 * half: nothing else may write `role` or `plan`, and nothing else may delete from `sessions`.
 */
import { ts } from "ts-morph";

/** Files allowed to perform these writes, and why. */
const OWNERS: Record<string, string> = {
  "api/lib/access-control.ts": "the module that owns them",
  // Account deletion removes every row of a user inside one transaction; the caller invalidates afterwards.
  "api/services/user-purge-service.ts": "the account purge, inside its transaction",
};

const GUARDED_COLUMNS = new Set(["role", "plan"]);

function line(file: string, sourceFile: ts.SourceFile, node: ts.Node): string {
  const { line: index } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${file}:${index + 1}`;
}

/** The callee name of a call expression, when it is a property access such as `db.delete`. */
function calleeName(node: ts.CallExpression, sourceFile: ts.SourceFile): string | null {
  const expression = node.expression;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.getText(sourceFile);
  if (ts.isIdentifier(expression)) return expression.getText(sourceFile);
  return null;
}

/**
 * `file:line` of every guarded write in the text, or nothing when the file is allowed to make them.
 *
 * Deliberately over-approximate on `.set({ role })` and `.set({ plan })`: the table is often chosen through a
 * variable (`const table = userType === "oauth" ? users : localUsers`), so the column name is what can be
 * seen. A different table with a column of the same name would be reported, and belongs in the owners list
 * with its reason rather than in a quieter rule.
 */
export function guardedAccessWrites(file: string, text: string): string[] {
  const normalized = file.split("\\").join("/");
  if (normalized in OWNERS) return [];
  if (!text.includes("sessions") && !text.includes(".set(")) return [];

  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node, sourceFile);

      if (name === "delete" && node.arguments.length === 1 && node.arguments[0].getText(sourceFile) === "sessions") {
        found.push(`${line(file, sourceFile, node)} deletes from sessions`);
      }

      if (name === "set" && node.arguments.length >= 1 && ts.isObjectLiteralExpression(node.arguments[0])) {
        for (const property of node.arguments[0].properties) {
          const key = property.name?.getText(sourceFile)?.replace(/['"]/g, "");
          if (key && GUARDED_COLUMNS.has(key)) {
            found.push(`${line(file, sourceFile, node)} writes ${key}`);
          }
        }
      }
    }
    node.forEachChild(visit);
  };

  visit(sourceFile);
  return found;
}
