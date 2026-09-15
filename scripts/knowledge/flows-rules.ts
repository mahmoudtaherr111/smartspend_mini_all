/**
 * Rules for the hand-drawn flows in docs/architecture/flows: every step must exist in the code.
 *
 * LikeC4 accepts a dynamic-view step between any two elements, related or not, so a diagram could keep
 * describing a call the code stopped making. These rules hold each step to the model that `npm run atlas`
 * generates from the source: there must be a relationship from the step's source (or an element inside
 * it) to its target (or an element inside it). A step the code cannot show, such as a person's action, is
 * allowed only when its line ends with `// intent: <reason>`.
 *
 * The parser reads the .c4 files directly, so it needs neither LikeC4 nor a database. It relies on the
 * format the generator writes and the hand-written files follow: one declaration (`id = kind 'title'`) or
 * relationship (`a.b -> c.d`) per line, relationships at the top level of a model block with full names,
 * and `{` / `}` at the end of a line.
 *
 * Shared by tests/knowledge/flows.test.ts, `npm run agent:finish` and `npm run changes`.
 */
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../atlas/lib/util";
import type { RuleResult } from "./types";

export interface ModelElement {
  name: string;
  kind: string;
  title: string;
  file: string;
}

export interface ModelRelationship {
  source: string;
  target: string;
  kind: string | null;
  file: string;
}

export interface FlowStep {
  file: string;
  view: string;
  source: string;
  target: string;
  reverse: boolean;
  intent: boolean;
  text: string;
}

export interface ArchitectureModel {
  elements: Map<string, ModelElement>;
  relationships: ModelRelationship[];
  steps: FlowStep[];
}

export interface SourceFile {
  file: string;
  text: string;
}

const NAME = String.raw`[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)*`;
const RELATIONSHIP = new RegExp(String.raw`^(${NAME})\s+(?:-\[([\w-]+)\]->|->)\s+(${NAME})\b`);
const STEP = new RegExp(String.raw`^(${NAME})\s+(->|<-)\s+(${NAME})\b`);
const DECLARATION = /^([A-Za-z_][\w-]*)\s*=\s*([A-Za-z_][\w-]*)\b/;
const TITLE = /^\s*[A-Za-z_][\w-]*\s*=\s*[A-Za-z_][\w-]*\s+'((?:[^'\\]|\\.)*)'/;

function codeLines(text: string): Array<{ raw: string; code: string }> {
  return text
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

/** Parses LikeC4 sources written in the one-declaration-per-line format described above. */
export function parseArchitectureModel(sources: SourceFile[]): ArchitectureModel {
  const elements = new Map<string, ModelElement>();
  const relationships: ModelRelationship[] = [];
  const steps: FlowStep[] = [];

  for (const { file, text } of sources) {
    // Each open block remembers the element name that encloses it (null outside any element) and whether
    // it is a dynamic view whose lines are steps.
    const stack: Array<{ element: string | null; dynamicView: string | null; section: string }> = [];
    const current = () => stack[stack.length - 1];

    for (const { raw, code } of codeLines(text)) {
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
            file,
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
        const declaration = DECLARATION.exec(code);
        if (declaration) {
          const name = parentElement ? `${parentElement}.${declaration[1]}` : declaration[1];
          elements.set(name, { name, kind: declaration[2], title: TITLE.exec(raw)?.[1] ?? "", file });
          if (opens) stack.push({ element: name, dynamicView: null, section });
          continue;
        }
        const relationship = RELATIONSHIP.exec(code);
        if (relationship && parentElement === null) {
          relationships.push({ source: relationship[1], target: relationship[3], kind: relationship[2] ?? null, file });
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

function c4Files(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "node_modules" ? [] : c4Files(full);
      return entry.name.endsWith(".c4") ? [full] : [];
    })
    .sort();
}

/** The model as it is on disk: generated and hand-written .c4 files under docs/architecture. */
export function readArchitectureModel(root = REPO_ROOT): ArchitectureModel {
  return parseArchitectureModel(
    c4Files(path.join(root, "docs", "architecture")).map((file) => ({
      file: path.relative(root, file).split(path.sep).join("/"),
      text: fs.readFileSync(file, "utf8"),
    })),
  );
}

const within = (name: string, scope: string) => name === scope || name.startsWith(`${scope}.`);

export function checkFlows(root = REPO_ROOT): RuleResult[] {
  const model = readArchitectureModel(root);
  const flowsDir = path.join(root, "docs", "architecture", "flows");
  const flowFiles = fs.existsSync(flowsDir) ? fs.readdirSync(flowsDir).filter((name) => name.endsWith(".c4")) : [];

  const unreadable: string[] = [];
  if (model.elements.size <= 100) unreadable.push(`the parser found only ${model.elements.size} elements`);
  if (model.relationships.length <= 100) unreadable.push(`the parser found only ${model.relationships.length} relationships`);
  if (flowFiles.length === 0 || model.steps.length === 0) unreadable.push("no flow steps were found in docs/architecture/flows");

  return [
    {
      id: "flows-model-readable",
      title: "the generated model and at least one flow can be read",
      fix: "Run npm run atlas. If the generator's output format changed, update scripts/knowledge/flows-rules.ts.",
      violations: unreadable,
    },
    {
      id: "flows-elements-exist",
      title: "flows name only elements that exist in the model",
      fix: "Use the full name of an element that exists (search docs/architecture/generated), or remove the step.",
      violations: model.steps
        .flatMap((step) => [step.source, step.target].map((name) => ({ step, name })))
        .filter(({ name }) => !model.elements.has(name))
        .map(({ step, name }) => `${step.file} (${step.view}): "${name}" in "${step.text}"`),
    },
    {
      id: "flows-steps-backed",
      title: "every flow step is backed by a relationship found in the code, unless marked as intent",
      fix: "Change the step to a call the code makes, or end a human action with // intent: <reason>.",
      violations: model.steps
        .filter((step) => !step.intent)
        // A reverse step is the reply to a request; the code shows the request, written in the same order.
        .filter(
          (step) =>
            !model.relationships.some(
              (relationship) => within(relationship.source, step.source) && within(relationship.target, step.target),
            ),
        )
        .map((step) => `${step.file} (${step.view}): ${step.text}`),
    },
    {
      id: "generated-relationships-declared",
      title: "generated relationships connect only declared elements",
      fix: "Run npm run atlas. A dangling relationship means the generator emitted an element it did not declare.",
      violations: [
        ...new Set(
          model.relationships
            .flatMap((relationship) => [relationship.source, relationship.target])
            .filter((name) => !model.elements.has(name)),
        ),
      ],
    },
  ];
}
