import path from "node:path";
import { fileURLToPath } from "node:url";

/** Normalizes separators and the Windows drive letter so paths compare equal everywhere. */
export function toPosix(p: string): string {
  return p
    .replace(/\\/g, "/")
    .replace(/^([a-z]):/, (_match, drive: string) => `${drive.toUpperCase()}:`);
}

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

const ROOT_POSIX = toPosix(REPO_ROOT);

/** Repository-relative POSIX path for an absolute path. */
export function rel(absPath: string): string {
  return path.posix.relative(ROOT_POSIX, toPosix(absPath));
}

/** Code-point comparison: locale-independent, so output is identical on every machine. */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function byKey<T>(key: (item: T) => string) {
  return (a: T, b: T) => compareStrings(key(a), key(b));
}

export function uniqSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareStrings);
}

const globCache = new Map<string, RegExp>();

/** Minimal glob support: `**`, `*` and `?`, matched against repository-relative paths. */
export function globToRegExp(glob: string): RegExp {
  const cached = globCache.get(glob);
  if (cached) return cached;
  let pattern = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          pattern += "(?:.*/)?";
          i += 2;
        } else {
          pattern += ".*";
          i += 1;
        }
      } else {
        pattern += "[^/]*";
      }
    } else if (char === "?") {
      pattern += "[^/]";
    } else if ("\\^$+.()|{}[]".includes(char)) {
      pattern += `\\${char}`;
    } else {
      pattern += char;
    }
  }
  const regex = new RegExp(`^${pattern}$`);
  globCache.set(glob, regex);
  return regex;
}

export function matchesGlob(value: string, globs: readonly string[]): boolean {
  return globs.some((glob) => globToRegExp(glob).test(value));
}

/** Evaluates literals such as `400`, `60_000` or `15 * 60_000`; anything else is unknown. */
export function evalNumericExpression(text: string | undefined): number | null {
  if (!text) return null;
  const cleaned = text.replace(/_/g, "").trim();
  if (!/^[\d\s*]+$/.test(cleaned)) return null;
  return cleaned
    .split("*")
    .map((part) => Number(part.trim()))
    .reduce((product, value) => product * value, 1);
}

export function code(value: string): string {
  return `\`${value.replace(/`/g, "'")}\``;
}

export function codeList(values: readonly string[]): string {
  return values.length === 0 ? "—" : values.map(code).join(", ");
}

export function mdTable(headers: readonly string[], rows: readonly string[][]): string {
  if (rows.length === 0) return "_None._\n";
  const escape = (cell: string) => cell.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const lines = [
    `| ${headers.map(escape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ];
  return `${lines.join("\n")}\n`;
}
