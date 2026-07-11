import { describe, expect, it } from "vitest";
import { extractPeople, extractAmounts, extractEntities } from "./entity-extractor";
import { isLikelyPersonName, EGYPTIAN_MALE_NAMES, EGYPTIAN_FEMALE_NAMES, FAMILY_TERMS, MERCHANT_NEGATIVE_LIST } from "./egyptian-names-dictionary";
import { pickAllPersonCandidates, resolvePersonForTransaction } from "./person-resolver";

describe("R1 acceptance — multi-word person names and 4 critical sentences", () => {
  it("sentence 1: \"500 جنيه غدا مع سلمى\" — must extract سلمى as the person, NOT غدا or مع", () => {
    const text = "500 جنيه غدا مع سلمى";
    const people = extractPeople(text, []);
    expect(people).toContain("سلمى");
    expect(people).not.toContain("غدا");
    expect(people).not.toContain("مع");
    expect(people).not.toContain("جنيه");

    const amounts = extractAmounts(text);
    expect(amounts.length).toBe(1);
    expect(amounts[0].amount).toBe(500);
  });

  it("sentence 2: \"دفعت 200 اكل و50 مواصلات\" — two transactions decomposed", () => {
    const text = "دفعت 200 اكل و50 مواصلات";
    const amounts = extractAmounts(text);
    expect(amounts.length).toBe(2);
    const sortedAmounts = amounts.map(a => a.amount).sort((a, b) => a - b);
    expect(sortedAmounts).toEqual([50, 200]);

    const entities = extractEntities(text, []);
    expect(entities.hasMultipleTransactions).toBe(true);
  });

  it("sentence 3: \"حولت لأحمد 1000\" — أحمد recognised as person (preposition لـ + name)", () => {
    const text = "حولت لأحمد 1000";
    const people = extractPeople(text, []);
    expect(people.some(p => p.includes("احمد") || p.includes("أحمد"))).toBe(true);

    const amounts = extractAmounts(text);
    expect(amounts.length).toBe(1);
    expect(amounts[0].amount).toBe(1000);

    const candidates = pickAllPersonCandidates(null, text, []);
    expect(candidates.length).toBeGreaterThan(0);
    const cleaned = candidates.map(c => c.replace(/[\u0640]/g, ""));
    expect(cleaned.some(c => c === "احمد" || c === "أحمد")).toBe(true);
  });

  it("sentence 4: \"سلفت عبد الرحمن 5000\" — multi-word name عبد الرحمن preserved", () => {
    const text = "سلفت عبد الرحمن 5000";
    const candidates = pickAllPersonCandidates(null, text, []);
    expect(candidates.length).toBeGreaterThan(0);
    const joined = candidates.join(" ");
    expect(joined).toContain("عبد");
    expect(joined).toContain("الرحمن");

    const amounts = extractAmounts(text);
    expect(amounts.length).toBe(1);
    expect(amounts[0].amount).toBe(5000);
  });

  it("isLikelyPersonName recognises single-token names from the dictionary", () => {
    expect(isLikelyPersonName("سلمى")).toBe(true);
    expect(isLikelyPersonName("سالم")).toBe(true);
    expect(isLikelyPersonName("أحمد")).toBe(true);
    expect(isLikelyPersonName("عبدالرحمن")).toBe(true);
  });

  it("isLikelyPersonName rejects non-name words that appear in transactions", () => {
    expect(isLikelyPersonName("غدا")).toBe(false);
    expect(isLikelyPersonName("مع")).toBe(false);
    expect(isLikelyPersonName("جنيه")).toBe(false);
    expect(isLikelyPersonName("مواصلات")).toBe(false);
  });

  it("dictionaries are frozen / immutable at runtime", () => {
    expect(() => EGYPTIAN_MALE_NAMES.add("HACK_NAME")).toThrow();
    expect(() => EGYPTIAN_FEMALE_NAMES.add("HACK_NAME")).toThrow();
    expect(() => FAMILY_TERMS.add("HACK_NAME")).toThrow();
    expect(() => MERCHANT_NEGATIVE_LIST.add("HACK_NAME")).toThrow();
    expect(EGYPTIAN_MALE_NAMES.has("HACK_NAME")).toBe(false);
  });

  it("parenthesized relation extraction: \"دفعت لفريدة 200 (أختي)\"", () => {
    const text = "دفعت لفريدة 200 (أختي)";
    const people = extractPeople(text, []);
    expect(people.some(p => p.includes("فريدة"))).toBe(true);

    const resolution = resolvePersonForTransaction({
      candidateName: "فريدة",
      transactionText: text,
      originalText: text,
      knownPeople: [],
    });
    expect(resolution.name).toBeTruthy();
    expect(resolution.relationship).toBe("أخت");
  });

  it("merchant-name disambiguation: \"كريم\" as Careem vs person", () => {
    const personContext = "اديت كريم 100";
    const people = extractPeople(personContext, []);
    expect(people.some(p => p === "كريم" || p === "كرييم")).toBe(true);

    const transportContext = "ركبت كريم بـ 50";
    const transportPeople = extractPeople(transportContext, []);
    expect(transportPeople.some(p => p === "كريم" || p === "كرييم")).toBe(false);
  });

  it("known-people direct lookup yields 100% confidence path (no AI call needed)", () => {
    const knownPeople = [
      { name: "مروان", relationship: "أخ", category: "العائلة", subCategory: "مروان أخوك" },
    ];
    const text = "حولت 500 لمروان";
    const people = extractPeople(text, knownPeople.map(p => p.name));
    expect(people).toContain("مروان");

    const resolution = resolvePersonForTransaction({
      candidateName: "مروان",
      transactionText: text,
      originalText: text,
      knownPeople,
    });
    expect(resolution.isKnown).toBe(true);
    expect(resolution.name).toBe("مروان");
    expect(resolution.category).toBe("العائلة");
  });

  it("unknown person triggers clarification rather than silent auto-save", () => {
    const text = "حوّلت 500 لمصطفى";
    const knownPeople = [
      { name: "مروان", relationship: "أخ", category: "العائلة", subCategory: "مروان أخوك" },
    ];
    const resolution = resolvePersonForTransaction({
      candidateName: "مصطفى",
      transactionText: text,
      originalText: text,
      knownPeople,
    });
    expect(resolution.isKnown).toBe(false);
    expect(resolution.needsClarification).toBe(true);
    expect(resolution.clarificationQuestion).toBeTruthy();
  });
});
