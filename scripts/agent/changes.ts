/**
 * `npm run changes`: what changed in the system over a stretch of history, without anyone writing it down.
 *
 * It lists the commits in the range with the `Agent:` trailer that names the tool behind each one and the systems
 * whose code each commit changed (docs/atlas/systems/files.md), says which system explanations were checked again
 * (docs/systems/verified.json), and compares the architecture model (docs/architecture) at both ends: which
 * tables, procedures, HTTP routes, jobs, pages, modules and outside systems appeared or disappeared, and which
 * reads, writes, calls and uses started or stopped. Everything comes from git and from generated files, so the
 * report cannot drift.
 *
 *   npm run changes                                  the last 7 days of the current branch
 *   npm run changes -- --since "2 days ago"
 *   npm run changes -- --from <rev> --to <rev>
 *   npm run changes -- --lang ar                     in Arabic, for the owner
 */
import { execFileSync } from "node:child_process";
import { REPO_ROOT } from "../atlas/lib/util";
import { parseArchitectureModel, type ArchitectureModel, type ModelElement } from "../knowledge/flows-rules";

export interface ElementChange {
  name: string;
  kind: string;
  title: string;
}

export interface LinkChange {
  source: string;
  target: string;
  kind: string;
}

export interface ModelDiff {
  added: ElementChange[];
  removed: ElementChange[];
  linksAdded: LinkChange[];
  linksRemoved: LinkChange[];
}

export interface CommitInfo {
  hash: string;
  date: string;
  subject: string;
  agent: string;
  /** Files the commit changed; merges list none. */
  files?: string[];
}

export interface SystemsContext {
  /** The systems at the end of the range, in the order of docs/architecture/systems.json. */
  systems: Array<{ id: string; title: string; titleAr: string }>;
  /** Which systems each source file belongs to, from docs/atlas/systems/files.md. */
  byFile: Map<string, string[]>;
  /** Systems whose check record in docs/systems/verified.json changed within the range. */
  rechecked: Set<string>;
}

type Lang = "en" | "ar";

/** Element kinds a person cares about; areas, systems and containers are structure, not change. */
const TRACKED_KINDS = ["table", "procedure", "endpoint", "job", "page", "module", "external", "store"];
/** Relationship kinds that describe behaviour; module imports are left out as noise. */
const TRACKED_LINKS = ["reads", "writes", "calls", "uses"];

const KIND_LABEL: Record<Lang, Record<string, string>> = {
  en: {
    table: "table",
    procedure: "procedure",
    endpoint: "HTTP route",
    job: "scheduled job",
    page: "page",
    module: "module",
    external: "outside system",
    store: "data store",
  },
  ar: {
    table: "جدول",
    procedure: "procedure في الـAPI",
    endpoint: "مسار HTTP",
    job: "مهمة مجدولة",
    page: "صفحة",
    module: "موديول",
    external: "خدمة خارجية",
    store: "مخزن بيانات",
  },
};

const LINK_VERB: Record<Lang, Record<string, [added: string, removed: string]>> = {
  en: {
    reads: ["now reads", "no longer reads"],
    writes: ["now writes to", "no longer writes to"],
    calls: ["now calls", "no longer calls"],
    uses: ["now uses", "no longer uses"],
  },
  ar: {
    reads: ["بقى بيقرأ من", "بطّل يقرأ من"],
    writes: ["بقى بيكتب في", "بطّل يكتب في"],
    calls: ["بقى بينادي", "بطّل ينادي"],
    uses: ["بقى بيستخدم", "بطّل يستخدم"],
  },
};

function git(args: string[]): string {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function gitShow(rev: string, file: string): string | null {
  try {
    return git(["show", `${rev}:${file}`]);
  } catch {
    return null;
  }
}

/** The architecture model as it was committed at `rev`; empty when that commit has none. */
export function modelAt(rev: string): ArchitectureModel {
  const files = git(["ls-tree", "-r", "--name-only", rev, "--", "docs/architecture"])
    .split("\n")
    .filter((file) => file.endsWith(".c4"));
  return parseArchitectureModel(files.map((file) => ({ file, text: git(["show", `${rev}:${file}`]) })));
}

/** The rows of docs/atlas/systems/files.md: each file with the systems it belongs to. */
export function parseFileIndex(text: string): Map<string, string[]> {
  const byFile = new Map<string, string[]>();
  for (const line of text.split("\n")) {
    const row = /^\| `([^`]+)` \| (.+) \|$/.exec(line.trim());
    if (row) byFile.set(row[1], [...new Set([...row[2].matchAll(/\]\(([\w-]+)\.md\)/g)].map((match) => match[1]))].sort());
  }
  return byFile;
}

/** The systems at `to`, the files that belong to them, and the system pages checked again between the two revisions. */
export function systemsContext(from: string, to: string): SystemsContext {
  let systems: SystemsContext["systems"] = [];
  try {
    const config = JSON.parse(gitShow(to, "docs/architecture/systems.json") ?? "{}") as { systems?: SystemsContext["systems"] };
    systems = (config.systems ?? []).map(({ id, title, titleAr }) => ({ id, title, titleAr }));
  } catch {
    // A commit without a readable systems map reports no systems.
  }
  const record = (rev: string): Record<string, unknown> => {
    try {
      return (JSON.parse(gitShow(rev, "docs/systems/verified.json") ?? "{}") as { systems?: Record<string, unknown> }).systems ?? {};
    } catch {
      return {};
    }
  };
  const before = record(from);
  const after = record(to);
  return {
    systems,
    byFile: parseFileIndex(gitShow(to, "docs/atlas/systems/files.md") ?? ""),
    rechecked: new Set(Object.keys(after).filter((id) => JSON.stringify(after[id]) !== JSON.stringify(before[id]))),
  };
}

export function diffModels(before: ArchitectureModel, after: ArchitectureModel): ModelDiff {
  const tracked = (model: ArchitectureModel) =>
    [...model.elements.values()].filter((element) => TRACKED_KINDS.includes(element.kind));
  const toChange = ({ name, kind, title }: ModelElement): ElementChange => ({ name, kind, title });
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

  const beforeNames = new Set(tracked(before).map((element) => element.name));
  const afterNames = new Set(tracked(after).map((element) => element.name));
  const added = tracked(after).filter((element) => !beforeNames.has(element.name)).map(toChange).sort(byName);
  const removed = tracked(before).filter((element) => !afterNames.has(element.name)).map(toChange).sort(byName);

  const links = (model: ArchitectureModel) =>
    new Map(
      model.relationships
        .filter((relationship) => relationship.kind && TRACKED_LINKS.includes(relationship.kind))
        .map((relationship) => [
          `${relationship.source} ${relationship.kind} ${relationship.target}`,
          { source: relationship.source, target: relationship.target, kind: relationship.kind as string },
        ]),
    );
  const beforeLinks = links(before);
  const afterLinks = links(after);
  // A link of an element that was itself added or removed is already told by that change.
  const touched = new Set([...added, ...removed].map((element) => element.name));
  const own = (link: LinkChange) => !touched.has(link.source) && !touched.has(link.target);
  const byKey = (a: LinkChange, b: LinkChange) =>
    `${a.source} ${a.kind} ${a.target}`.localeCompare(`${b.source} ${b.kind} ${b.target}`);

  return {
    added,
    removed,
    linksAdded: [...afterLinks].filter(([key]) => !beforeLinks.has(key)).map(([, link]) => link).filter(own).sort(byKey),
    linksRemoved: [...beforeLinks].filter(([key]) => !afterLinks.has(key)).map(([, link]) => link).filter(own).sort(byKey),
  };
}

function describe(name: string, model: ArchitectureModel, lang: Lang): string {
  const element = model.elements.get(name);
  const kind = element ? KIND_LABEL[lang][element.kind] ?? element.kind : "";
  const label = element?.title || name.split(".").pop() || name;
  return kind ? `${kind} \`${label}\`` : `\`${label}\``;
}

function systemsOfCommit(commit: CommitInfo, context: SystemsContext): string[] {
  return [...new Set((commit.files ?? []).flatMap((file) => context.byFile.get(file) ?? []))].sort();
}

function systemLines(commits: CommitInfo[], context: SystemsContext, lang: Lang): string[] {
  const ar = lang === "ar";
  const touched = new Map<string, { commits: number; agents: Set<string> }>();
  for (const commit of commits) {
    for (const id of systemsOfCommit(commit, context)) {
      const entry = touched.get(id) ?? { commits: 0, agents: new Set<string>() };
      entry.commits += 1;
      for (const agent of commit.agent.split(",").map((name) => name.trim()).filter(Boolean)) entry.agents.add(agent);
      touched.set(id, entry);
    }
  }
  const order = context.systems.map((system) => system.id);
  const ids = [...new Set([...touched.keys(), ...context.rechecked])].sort(
    (a, b) => (order.indexOf(a) + 1 || order.length + 1) - (order.indexOf(b) + 1 || order.length + 1) || a.localeCompare(b),
  );
  return ids.map((id) => {
    const system = context.systems.find((entry) => entry.id === id);
    const name = `${(ar ? system?.titleAr : system?.title) ?? id} (\`${id}\`)`;
    const entry = touched.get(id);
    const parts: string[] = [];
    if (entry) {
      const agents = [...entry.agents].sort().join(ar ? "، " : ", ");
      parts.push(ar ? `${entry.commits} commit${agents ? ` من ${agents}` : ""}` : `${entry.commits} commit(s)${agents ? ` by ${agents}` : ""}`);
    }
    if (context.rechecked.has(id)) parts.push(ar ? "شرحه اتراجع على الكود" : "its explanation was checked again");
    return `${name}: ${parts.join(ar ? "؛ " : "; ")}`;
  });
}

export function renderReport(
  range: { from: string; to: string },
  commits: CommitInfo[],
  diff: ModelDiff,
  models: { before: ArchitectureModel; after: ArchitectureModel },
  lang: Lang,
  systems?: SystemsContext,
): string {
  const ar = lang === "ar";
  const out: string[] = [
    ar
      ? `## التغييرات في النظام من ${range.from.slice(0, 7)} لحد ${range.to.slice(0, 7)}`
      : `## System changes from ${range.from.slice(0, 7)} to ${range.to.slice(0, 7)}`,
    "",
    ar ? "### الـcommits (مين عمل إيه)" : "### Commits (who did what)",
  ];
  out.push(
    ...(commits.length > 0
      ? commits.map((commit) => {
          const touched = systems ? systemsOfCommit(commit, systems) : [];
          return `- ${commit.date} \`${commit.hash}\` ${commit.subject}${commit.agent ? ` — ${commit.agent}` : ""}${touched.length > 0 ? ` · ${touched.join(", ")}` : ""}`;
        })
      : [ar ? "- مفيش commits في الفترة دي." : "- No commits in this range."]),
  );

  const section = (title: string, items: string[]) => {
    if (items.length > 0) out.push("", title, ...items.map((item) => `- ${item}`));
  };
  if (systems) section(ar ? "### الأنظمة اللي اتغيرت" : "### Systems touched", systemLines(commits, systems, lang));
  section(ar ? "### اتضاف" : "### Added", diff.added.map((element) => describe(element.name, models.after, lang)));
  section(ar ? "### اتشال" : "### Removed", diff.removed.map((element) => describe(element.name, models.before, lang)));
  section(
    ar ? "### علاقات جديدة" : "### New connections",
    diff.linksAdded.map(
      (link) => `${describe(link.source, models.after, lang)} ${LINK_VERB[lang][link.kind][0]} ${describe(link.target, models.after, lang)}`,
    ),
  );
  section(
    ar ? "### علاقات اتشالت" : "### Removed connections",
    diff.linksRemoved.map(
      (link) => `${describe(link.source, models.before, lang)} ${LINK_VERB[lang][link.kind][1]} ${describe(link.target, models.before, lang)}`,
    ),
  );
  if (diff.added.length + diff.removed.length + diff.linksAdded.length + diff.linksRemoved.length === 0) {
    out.push(
      "",
      ar
        ? "مفيش تغيير في شكل النظام (جداول، APIs، صفحات، مهام، خدمات خارجية)؛ التغييرات جوه الكود الموجود."
        : "No change to the shape of the system (tables, APIs, pages, jobs, outside systems); the commits changed existing code.",
    );
  }
  return `${out.join("\n")}\n`;
}

function option(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

function main(): void {
  const argv = process.argv.slice(2);
  const lang: Lang = option(argv, "lang") === "ar" ? "ar" : "en";
  const to = option(argv, "to") || "HEAD";
  let from = option(argv, "from");
  try {
    git(["rev-parse", "--verify", `${to}^{commit}`]);
    if (from) git(["rev-parse", "--verify", `${from}^{commit}`]);
  } catch {
    console.log(lang === "ar" ? "النطاق المطلوب مش موجود في تاريخ git هنا." : "The requested range is not in this git history.");
    return;
  }
  if (!from) {
    const since = option(argv, "since") || "7 days ago";
    from = git(["rev-list", "-1", `--before=${since}`, to]) || git(["rev-list", "--max-parents=0", to]).split("\n").pop()!;
  }

  const commits: CommitInfo[] = git([
    "log",
    "--reverse",
    "--date=short",
    "--name-only",
    "--format=%x1e%h%x1f%ad%x1f%s%x1f%(trailers:key=Agent,valueonly,separator=%x2C)",
    `${from}..${to}`,
  ])
    .split("\x1e")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [header, ...files] = chunk.split("\n");
      const [hash, date, subject, agent] = header.split("\x1f");
      return { hash, date, subject, agent: agent ?? "", files: files.map((file) => file.trim()).filter(Boolean) };
    });
  const models = { before: modelAt(from), after: modelAt(to) };
  process.stdout.write(
    renderReport({ from, to }, commits, diffModels(models.before, models.after), models, lang, systemsContext(from, to)),
  );
}

if (/changes\.ts$/.test(process.argv[1] ?? "")) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
