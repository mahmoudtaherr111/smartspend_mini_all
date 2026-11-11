import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { InvalidSetError, loadSet, parseSet, resolveGoldDate, shiftDay, validateSet } from "./set";

const good = (cases: unknown[]) => ({ name: "t", note: "", cases });
const spend = { amount: 100, kind: "spending", flow: "out", category: "dining", sub: "cafe" };

describe("dev-set.json", () => {
  it("loads, with ids unique and every label in the taxonomy", () => {
    const set = loadSet(join(import.meta.dirname, "dev-set.json"));
    expect(set.cases.length).toBeGreaterThan(0);
    expect(new Set(set.cases.map((item) => item.id)).size).toBe(set.cases.length);
    // An alternative from another group is accepted with its own kind, and reported.
    expect(set.warnings.every((warning) => warning.includes("alt"))).toBe(true);
  });
});

describe("validateSet", () => {
  it("accepts a well-formed set", () => {
    const check = validateSet(good([{ id: "A-1", text: "قهوة 100", expect: "clear", events: [spend] }]));
    expect(check).toEqual({ problems: [], warnings: [] });
  });

  it.each([
    ["unknown category", { ...spend, category: "food" }, "unknown category"],
    ["sub of another category", { ...spend, sub: "fuel" }, "is not a sub of dining"],
    ["kind the category refuses", { ...spend, kind: "income", flow: "in" }, "does not allow kind income"],
    ["flow the kind refuses", { ...spend, flow: "in" }, "cannot have flow in"],
    ["unknown kind", { ...spend, kind: "expense" }, "unknown kind"],
    ["non-positive amount", { ...spend, amount: 0 }, "amount must be a positive number"],
    ["bad alt", { ...spend, alt: [["dining", "nope"]] }, "alt 1"],
    ["typo field", { ...spend, catgory: "dining" }, 'unknown field "catgory"'],
    ["bad date", { ...spend, date: "yesterday" }, "date must be"],
    ["future offset", { ...spend, date: "offset:2" }, "future"],
    ["unreal ISO date", { ...spend, date: "2026-02-30" }, "not a real date"],
  ])("refuses %s", (_name, event, message) => {
    const { problems } = validateSet(good([{ id: "A-1", text: "x", expect: "clear", events: [event] }]));
    expect(problems.join("\n")).toContain(message);
  });

  it("refuses duplicate ids, empty text, unknown expect and events on ask cases", () => {
    const { problems } = validateSet(
      good([
        { id: "A-1", text: "x", expect: "clear", events: [spend] },
        { id: "A-1", text: " ", expect: "maybe", events: [] },
        { id: "A-2", text: "x", expect: "ask", events: [spend] },
        { id: "A-3", text: "x", expect: "clear", events: [] },
      ]),
    );
    const all = problems.join("\n");
    expect(all).toContain("duplicate id");
    expect(all).toContain("text must be non-empty");
    expect(all).toContain("expect must be one of");
    expect(all).toContain("an ask case has no events");
    expect(all).toContain("a clear case needs at least one event");
  });

  it("warns, without refusing, on an alternative whose category is bound to another kind", () => {
    const check = validateSet(good([{ id: "A-1", text: "x", expect: "doubt", events: [{ ...spend, alt: [["people_transfer", "other"]] }] }]));
    expect(check.problems).toEqual([]);
    expect(check.warnings[0]).toContain("people_transfer does not allow kind spending");
  });

  it("checks a case's context", () => {
    const { problems } = validateSet(
      good([{ id: "A-1", text: "x", expect: "clear", events: [spend], context: { people: [{}], commitments: [{ title: "قسط" }], wallets: [{ name: "" }], other: 1 } }]),
    );
    const all = problems.join("\n");
    expect(all).toContain("name is required");
    expect(all).toContain("kindLabel is required");
    expect(all).toContain('unknown context field "other"');
  });

  it("parseSet throws every problem at once", () => {
    try {
      parseSet(good([{ id: "", text: "", expect: "clear", events: [] }]));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidSetError);
      expect((error as InvalidSetError).problems.length).toBeGreaterThan(1);
    }
  });
});

describe("gold dates", () => {
  it("resolves offsets, days of the month and ISO dates against the day the case ran", () => {
    expect(resolveGoldDate("offset:-1", "2026-03-01")).toBe("2026-02-28");
    expect(resolveGoldDate("day:5", "2026-11-11")).toBe("2026-11-05");
    expect(resolveGoldDate("2026-10-01", "2026-11-11")).toBe("2026-10-01");
    expect(resolveGoldDate(undefined, "2026-11-11")).toBe("");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
  });
});
