import { describe, expect, it } from "vitest";
import { CAPTURE_MODEL_REPLY_SCHEMA } from "./capture/model-contract";
import { toGeminiSchema, type StructuredSchema } from "./llm-router";

const keysDeep = (node: unknown, found = new Set<string>()): Set<string> => {
  if (Array.isArray(node)) node.forEach((item) => keysDeep(item, found));
  else if (node && typeof node === "object") for (const [key, value] of Object.entries(node)) { found.add(key); keysDeep(value, found); }
  return found;
};

describe("toGeminiSchema", () => {
  it("turns Zod JSON Schema into Gemini's subset instead of letting the chain drop the schema", () => {
    const out = toGeminiSchema(CAPTURE_MODEL_REPLY_SCHEMA as StructuredSchema);
    const keys = keysDeep(out);
    for (const banned of ["$schema", "additionalProperties", "anyOf", "minLength", "maxLength"]) expect(keys.has(banned)).toBe(false);
    const props = out.properties as Record<string, Record<string, unknown>>;
    expect(props.flow).toEqual({ type: "string", enum: ["in", "out"], nullable: true });
    expect((props.amount as { nullable?: boolean; type?: string }).type).toBe("object");
    expect((props.amount as { nullable?: boolean }).nullable).toBe(true);
    expect(out.propertyOrdering).toEqual(Object.keys(props));
    expect(out.required).toEqual((CAPTURE_MODEL_REPLY_SCHEMA as { required: string[] }).required);
  });

  it("handles type arrays and const", () => {
    const out = toGeminiSchema({ $schema: "x", type: "object", properties: { a: { type: ["number", "null"] }, b: { const: "v" } } } as unknown as StructuredSchema);
    expect(out.properties).toEqual({ a: { type: "number", nullable: true }, b: { enum: ["v"] } });
  });

  it("leaves hand-written Gemini schemas exactly as they are", () => {
    const schema = { type: "object", properties: { x: { type: "string", nullable: true } }, required: ["x"] } as StructuredSchema;
    expect(toGeminiSchema(schema)).toBe(schema);
  });
});
