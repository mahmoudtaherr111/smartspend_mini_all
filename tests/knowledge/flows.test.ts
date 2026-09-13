/**
 * Every step of a hand-drawn flow in docs/architecture/flows must exist in the code.
 *
 * LikeC4 accepts a dynamic-view step between any two elements, related or not, so a diagram could
 * keep describing a call the code stopped making. This test holds each step to the model that
 * `npm run atlas` generates from the source: there must be a relationship from the step's source
 * (or an element inside it) to its target (or an element inside it). A step the code cannot show,
 * such as a person's action, is allowed only when its line ends with `// intent: <reason>`.
 *
 * It reads the .c4 files directly, so it needs neither LikeC4 nor a database. The format it relies
 * on is the one the generator writes and the hand-written files follow: one declaration
 * (`id = kind 'title'`) or relationship (`a.b -> c.d`) per line, relationships at the top level of a
 * model block with full names, and `{` / `}` at the end of a line.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ARCHITECTURE_DIR = path.resolve(process.cwd(), "docs", "architecture");
const FLOWS_DIR = path.join(ARCHITECTURE_DIR, "flows");

interface Step {
  file: string;
  view: string;
  source: string;
  target: string;
  reverse: boolean;
  intent: boolean;
  text: string;
}

function c4Files(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "node_modules" ? [] : c4Files(full);
      return entry.name.endsWith(".c4") ? [full] : [];
    })
    .sort();
}

function codeLines(file: string): Array<{ raw: string; code: string }> {
  return fs
    .readFileSync(file, "utf8")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((raw) => ({
      raw,
      code: raw
        .replace(/'(?:[^'\\]|\\.)*'/g, "''")
        .replace(/"(?:[^"\\]|\\.)*"/g, '""')
        .replace(/\/\/.*$/, "")
        .trim(),
    }));
}

const NAME = String.raw`[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)*`;
const RELATIONSHIP = new RegExp(String.raw`^(${NAME})\s+(?:-\[[\w-]+\]->|->)\s+(${NAME})\b`);
const STEP = new RegExp(String.raw`^(${NAME})\s+(->|<-)\s+(${NAME})\b`);

interface Model {
  elements: Set<string>;
  relationships: Array<{ source: string; target: string }>;
  steps: Step[];
}

function readModel(): Model {
  const elements = new Set<string>();
  const relationships: Array<{ source: string; target: string }> = [];
  const steps: Step[] = [];

  for (const file of c4Files(ARCHITECTURE_DIR)) {
    // Each open block remembers the element name that encloses it (null outside any element) and
    // whether it is a dynamic view whose lines are steps.
    const stack: Array<{ element: string | null; dynamicView: string | null; section: string }> = [];
    const current = () => stack[stack.length - 1];

    for (const { raw, code } of codeLines(file)) {
      if (!code) continue;
      if (code === "}") {
        stack.pop();
        continue;
      }
      const parentElement = current()?.element ?? null;
      const section = current()?.section ?? "";
      const opens = code.endsWith("{");

      const extend = /^extend\s+(\S+)\s*\{$/.exec(code);
      if (extend) {
        stack.push({ element: extend[1], dynamicView: null, section });
        continue;
      }

      const dynamicView = /^dynamic\s+view\s+([\w-]+)/.exec(code);
      if (dynamicView) {
        stack.push({ element: null, dynamicView: dynamicView[1], section });
        continue;
      }

      const viewName = current()?.dynamicView;
      if (viewName) {
        const step = STEP.exec(code);
        if (step) {
          steps.push({
            file: path.relative(process.cwd(), file).replace(/\\/g, "/"),
            view: viewName,
            source: step[1],
            target: step[3],
            reverse: step[2] === "<-",
            intent: /\/\/\s*intent:/.test(raw),
            text: code,
          });
        }
        if (opens) stack.push({ element: null, dynamicView: null, section });
        continue;
      }

      if (section === "model") {
        const declaration = /^([A-Za-z_][\w-]*)\s*=\s*[A-Za-z_][\w-]*\b/.exec(code);
        if (declaration) {
          const name = parentElement ? `${parentElement}.${declaration[1]}` : declaration[1];
          elements.add(name);
          if (opens) stack.push({ element: name, dynamicView: null, section });
          continue;
        }
        const relationship = RELATIONSHIP.exec(code);
        if (relationship && parentElement === null) {
          relationships.push({ source: relationship[1], target: relationship[2] });
        }
      }

      if (opens) {
        const keyword = /^(model|views|specification)\s*\{$/.exec(code)?.[1];
        stack.push({ element: parentElement, dynamicView: null, section: keyword ?? section });
      }
    }
  }
  return { elements, relationships, steps };
}

const within = (name: string, scope: string) => name === scope || name.startsWith(`${scope}.`);

describe("architecture flows (docs/architecture/flows)", () => {
  const model = readModel();

  it("reads the generated model and at least one flow", () => {
    expect(model.elements.size).toBeGreaterThan(100);
    expect(model.relationships.length).toBeGreaterThan(100);
    expect(model.steps.length).toBeGreaterThan(0);
    expect(fs.readdirSync(FLOWS_DIR).filter((name) => name.endsWith(".c4")).length).toBeGreaterThan(0);
  });

  it("names only elements that exist in the model", () => {
    const missing = model.steps
      .flatMap((step) => [step.source, step.target].map((name) => ({ step, name })))
      .filter(({ name }) => !model.elements.has(name))
      .map(({ step, name }) => `${step.file} (${step.view}): "${name}" in "${step.text}"`);
    expect(missing).toEqual([]);
  });

  it("backs every step with a relationship found in the code, unless marked as intent", () => {
    const unsupported = model.steps
      .filter((step) => !step.intent)
      .filter((step) => {
        // A reverse step is the reply to a request; the code shows the request.
        const [from, to] = step.reverse ? [step.source, step.target] : [step.source, step.target];
        return !model.relationships.some(
          (relationship) => within(relationship.source, from) && within(relationship.target, to),
        );
      })
      .map((step) => `${step.file} (${step.view}): ${step.text}`);
    expect(unsupported).toEqual([]);
  });

  it("generates relationships only between declared elements", () => {
    const dangling = model.relationships
      .flatMap((relationship) => [relationship.source, relationship.target])
      .filter((name) => !model.elements.has(name));
    expect([...new Set(dangling)]).toEqual([]);
  });
});
