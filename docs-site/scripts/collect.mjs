#!/usr/bin/env node
/**
 * Gathers `docs/` into the site's content folder, without a second copy living in git.
 *
 * The pages are written for people reading them in the repository: a first-level heading and relative links
 * to other pages. A Starlight page wants a title in front matter and links that resolve as routes. Rather
 * than put front matter into the source pages — where it would be noise for every agent that reads them —
 * this derives both on the way in:
 *
 *   - the first `# heading` becomes the title, and is dropped from the body so it is not shown twice;
 *   - a relative link to another `.md` under docs/ becomes that page's route, in the same language;
 *   - everything else is copied through untouched.
 *
 * The output is generated and git-ignored, so the pages have exactly one home.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, "..");
const REPO = path.resolve(SITE, "..");
const DOCS = path.join(REPO, "docs");
const OUT = path.join(SITE, "src", "content", "docs");

/** Folders whose pages are worth a reader's time; the rest of docs/ is run output and history. */
const INCLUDE = ["systems", "atlas", "architecture", "guides", "decisions", "ar"];
const SKIP = new Set(["reports", "releases", "node_modules"]);

function walk(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (entry.name.endsWith(".md")) found.push(full);
  }
  return found;
}

/** docs/ar/systems/admin.md -> ar/systems/admin ; docs/systems/admin.md -> systems/admin */
function routeOf(relative) {
  const withoutExtension = relative.replace(/\.md$/, "");
  const parts = withoutExtension.split("/");
  if (parts[parts.length - 1] === "README") parts[parts.length - 1] = "index";
  return parts.join("/");
}

function titleOf(text, fallback) {
  const heading = /^#\s+(.+)$/m.exec(text);
  return (heading?.[1] ?? fallback).replace(/`/g, "").trim();
}

function stripFirstHeading(text) {
  return text.replace(/^#\s+.+\n+/, "");
}

/** A relative link between two pages becomes a site route; anything else is left alone. */
function rewriteLinks(text, sourceRelative) {
  return text.replace(/\]\(([^)]+\.md)(#[^)]*)?\)/g, (whole, target, anchor = "") => {
    if (/^https?:\/\//.test(target)) return whole;
    const absolute = path.resolve(path.join(DOCS, path.dirname(sourceRelative)), target);
    if (!absolute.startsWith(DOCS)) return whole;
    const relative = path.relative(DOCS, absolute).split(path.sep).join("/");
    return `](/${routeOf(relative)}/${anchor})`;
  });
}

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const files = INCLUDE.flatMap((folder) => {
    const dir = path.join(DOCS, folder);
    return fs.existsSync(dir) ? walk(dir) : [];
  });
  const root = path.join(DOCS, "README.md");
  if (fs.existsSync(root)) files.push(root);

  let written = 0;
  for (const file of files) {
    const relative = path.relative(DOCS, file).split(path.sep).join("/");
    const raw = fs.readFileSync(file, "utf8");
    const title = titleOf(raw, relative);
    const body = rewriteLinks(stripFirstHeading(raw), relative);
    const target = path.join(OUT, `${routeOf(relative)}.md`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      `---\ntitle: ${JSON.stringify(title)}\neditUrl: false\n---\n\n${body}`,
      "utf8",
    );
    written += 1;
  }

  // The home page is written here rather than in docs/, because it is the one page that only makes sense as a
  // web page: it is the door for someone who has never opened the repository.
  fs.writeFileSync(
    path.join(OUT, "index.md"),
    [
      "---",
      'title: "SmartSpend — الشرح الكامل"',
      'description: "كل نظام في التطبيق: بيعمل إيه، بيشتغل إزاي، وإيه مشاكله المعروفة."',
      "editUrl: false",
      "---",
      "",
      "التطبيق مقسوم لأنظمة، وكل نظام ليه صفحة بالعربي وصفحة إنجليزي وصفحة حقائق متولّدة من الكود.",
      "",
      "- **[ابدأ من هنا: الأنظمة بالعربي](/ar/systems/index/)** — كل جزء في التطبيق بيعمل إيه ومشاكله.",
      "- **[حالة المشروع](/atlas/systems/state.ar/)** — كل نظام، آخر مراجعة لشرحه، وكل المشاكل المعروفة مرتبة بالخطورة.",
      "- **[الخريطة التفاعلية](/map/index.html)** — الرسمة الكاملة للنظام، تقدر تكبّر وتدوس على أي جزء.",
      "- [الدليل الكامل بالعربي](/ar/index/) · [The English pages for agents](/systems/index/)",
      "",
      "كل صفحة هنا متولّدة من نفس الملفات اللي في الريبو، فهي دايماً نفس الكلام اللي الـagents بتقراه.",
    ].join("\n"),
    "utf8",
  );

  console.log(`collected ${written} page(s) from docs/ into ${path.relative(REPO, OUT)}`);
}

main();
