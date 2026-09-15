/**
 * Finds raw `sql` fragments whose OR sits outside parentheses (api/AGENTS.md rule 3).
 *
 * Drizzle's and() joins its arguments with " and " without wrapping each one, so a fragment such as
 * sql`${a} LIKE ${q} OR ${b} LIKE ${q}` inside and(eq(userId), ...) applies the user filter to the
 * first alternative only. Whole statements (SELECT, INSERT, UPDATE, DELETE, WITH) are not combined by
 * and() and are skipped.
 */
import { ts } from "ts-morph";

const WHOLE_STATEMENT = /^\s*(?:select|insert|update|delete|replace|with)\b/i;

/** The fragment at parenthesis depth zero; quoted strings and nested groups become spaces. */
function topLevelText(fragment: string): string {
  let depth = 0;
  let quote: string | null = null;
  let out = "";
  for (const char of fragment) {
    if (quote) {
      if (char === quote) quote = null;
      out += " ";
    } else if (char === "'" || char === '"' || char === "`") {
      quote = char;
      out += " ";
    } else if (char === "(") {
      depth += 1;
      out += " ";
    } else if (char === ")") {
      depth = Math.max(0, depth - 1);
      out += " ";
    } else {
      out += depth === 0 ? char : " ";
    }
  }
  return out;
}

/** `file:line` of every raw sql fragment in the text with an OR outside parentheses. */
export function unparenthesizedOrFragments(file: string, text: string): string[] {
  if (!text.includes("sql")) return [];
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isTaggedTemplateExpression(node) && /^sql\w*$/.test(node.tag.getText(sourceFile))) {
      const template = node.template;
      const fragment = ts.isNoSubstitutionTemplateLiteral(template)
        ? template.text
        : [template.head.text, ...template.templateSpans.map((span) => span.literal.text)].join(" ? ");
      if (!WHOLE_STATEMENT.test(fragment) && /\bor\b/i.test(topLevelText(fragment))) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        found.push(`${file}:${line + 1}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}
