/**
 * The reading context: its bounds, its references, the user's vocabulary in v2 ids, the
 * familiar rule, the person matcher, and a database part that fails without failing the
 * reading. The database is a recording fake: each query's SQL is rendered so the identity
 * filter and the limit can be checked on every one.
 */
import type { SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Recorded {
  table: string;
  where?: SQL;
  limit?: number;
}

const fake = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  failing: new Set<string>(),
  queries: [] as Array<{ table: string; where?: unknown; limit?: number }>,
}));

vi.mock("../../queries/connection", async () => {
  const { getTableName: nameOf } = await import("drizzle-orm");
  const select = () => {
    const query: { table: string; where?: unknown; limit?: number } = { table: "" };
    const builder = {
      from(table: Parameters<typeof nameOf>[0]) {
        query.table = nameOf(table);
        return builder;
      },
      where(condition: unknown) {
        query.where = condition;
        return builder;
      },
      orderBy() {
        return builder;
      },
      limit(count: number) {
        query.limit = count;
        return builder;
      },
      then(resolve: (rows: unknown[]) => unknown, reject: (err: unknown) => unknown) {
        fake.queries.push(query);
        if (fake.failing.has(query.table)) return Promise.reject(new Error(`${query.table} is down`)).then(resolve, reject);
        return Promise.resolve(fake.rows[query.table] ?? []).then(resolve, reject);
      },
    };
    return builder;
  };
  const db = { select };
  return { db, getDb: () => db };
});

import { TAXONOMY } from "../../../contracts/taxonomy";
import { storedFiling, v2OfStored } from "./bridge";
import {
  assembleContext,
  loadReadingContext,
  personMatcher,
  toGuardContext,
  toPolicyFacts,
  toPromptContext,
  type CommitmentInput,
} from "./context";

const dialect = new MySqlDialect();
const rendered = (query: Recorded) => (query.where ? dialect.sqlToQuery(query.where) : { sql: "", params: [] });

const base = { today: "2026-11-11", weekday: "Wednesday" };

describe("assembling a context", () => {
  it("bounds every list and leaves silenced people out of the prompt", () => {
    const contacts = Array.from({ length: 45 }, (_, i) => ({ name: `شخص ${i}`, relation: i === 0 ? "أخ" : null, isSilenced: i % 3 === 1 }));
    const commitments: CommitmentInput[] = Array.from({ length: 30 }, (_, i) => ({
      cashflowId: 100 + i, title: `التزام ${i}`, kindLabel: "قسط", amount: 500, dueDay: `2026-11-${String(10 + (i % 15)).padStart(2, "0")}`, person: null,
    }));
    const wallets = Array.from({ length: 12 }, (_, i) => ({ id: 500 + i, name: `محفظة ${i}` }));
    const ctx = assembleContext({ ...base, contacts, commitments, wallets });

    expect(ctx.people).toHaveLength(30);
    expect(ctx.people[0]).toEqual({ name: "شخص 0", relation: "أخ" });
    expect(ctx.people.some((person) => person.name === "شخص 1")).toBe(false);
    expect(ctx.commitments).toHaveLength(25);
    expect(ctx.commitmentRefs.size).toBe(25);
    expect(ctx.wallets).toHaveLength(10);
    expect(ctx.walletRefs.get("w10")).toBe(509);
    // A silenced person is still someone the user knows.
    expect(ctx.isKnownPerson("شخص 1")).toBe(true);
  });

  it("gives references earliest due first, then by id, and keeps what each stands for", () => {
    const ctx = assembleContext({
      ...base,
      commitments: [
        { cashflowId: 9, title: "دين فريدة", kindLabel: "دين", amount: 1000, dueDay: null, settleDay: "2026-03-01", person: "فريدة" },
        { cashflowId: 7, title: "الإيجار", kindLabel: "إيجار", amount: 3000, dueDay: "2026-11-20", person: null },
        { cashflowId: 3, title: "النت", kindLabel: "فاتورة", amount: 400, dueDay: "2026-11-20", person: null },
        { cashflowId: 5, title: "المدرسة", kindLabel: "مدرسة", amount: 6500, dueDay: "2026-11-02", settleDay: "2026-11-01", person: null },
      ],
    });
    expect(ctx.commitments.map((item) => [item.ref, item.cashflowId])).toEqual([["c1", 5], ["c2", 3], ["c3", 7], ["c4", 9]]);
    expect(ctx.commitmentRefs.get("c1")).toEqual({ cashflowId: 5, dueDay: "2026-11-01" });
    expect(ctx.commitmentRefs.get("c4")).toEqual({ cashflowId: 9, dueDay: "2026-03-01" });

    const prompt = toPromptContext(ctx);
    expect(prompt.commitments?.[0]).toEqual({ ref: "c1", title: "المدرسة", kindLabel: "مدرسة", amount: 6500, dueDay: "2026-11-02", person: null });
    expect(JSON.stringify(prompt)).not.toContain("cashflowId");

    const guard = toGuardContext(ctx, { understanding_max_amount: "50000", understanding_max_days_back: "30" });
    expect([...guard.commitmentRefs]).toEqual(["c1", "c2", "c3", "c4"]);
    expect(guard).toMatchObject({ today: "2026-11-11", maxAmount: 50000, maxDaysBack: 30 });
    expect(toGuardContext(ctx)).toMatchObject({ maxAmount: 10_000_000, maxDaysBack: 366 });
  });

  it("translates the user's vocabulary to v2 ids, newest first, once per phrase, and drops what does not translate", () => {
    const ctx = assembleContext({
      ...base,
      vocabulary: [
        { phrase: "اوبر", category: "مواصلات", subCategory: "أوبر/كريم", at: 3 },
        { phrase: "أوبر", category: "أكل وشرب", subCategory: "دليفري", at: 1 },
        { phrase: "احمد", category: "العائلة", subCategory: "أحمد أخوك", at: 5 },
        { phrase: "قسط", category: "أقساط وفوايد", subCategory: "أقساط", at: 2 },
        { phrase: "حاجة", category: "فئة مش موجودة", subCategory: null, at: 4 },
      ],
    });
    expect(ctx.vocabulary).toEqual([
      { phrase: "اوبر", category: "transport", sub: "ride_apps" },
      { phrase: "قسط", category: "financial_fees", sub: "installment" },
    ]);

    const many = assembleContext({ ...base, vocabulary: Array.from({ length: 50 }, (_, i) => ({ phrase: `كلمة ${i}`, category: "تسوق", subCategory: "ملابس", at: i })) });
    expect(many.vocabulary).toHaveLength(30);
    expect(many.vocabulary[0].phrase).toBe("كلمة 49");
  });

  it("calls a pair familiar once the user saved it twice in the recent rows", () => {
    const ctx = assembleContext({
      ...base,
      recentFilings: [
        { category: "فواتير", subCategory: "إنترنت" },
        { category: "صحة", subCategory: "دكتور" },
        { category: "فواتير", subCategory: "إنترنت" },
        { category: "متنوعات", subCategory: null },
        { category: "متنوعات", subCategory: "عام" },
      ],
    });
    const facts = toPolicyFacts(ctx);
    expect(facts.isFamiliar("bills", "internet_landline")).toBe(true);
    expect(facts.isFamiliar("health", "doctor")).toBe(false);
    // A null subcategory is stored as «عام».
    expect(facts.isFamiliar("misc", "other")).toBe(true);
    // Two v2 answers that store the same pair are equally familiar.
    expect(facts.isFamiliar("groceries", "supermarket")).toBe(false);
  });
});

describe("recognising the user's people", () => {
  const known = personMatcher([
    { name: "أحمد" },
    { name: "محمد علي" },
    { name: "الحاج سيد" },
    { name: "منى", aliases: ["مونمون"] },
  ]);

  it("matches names, aliases and first names, with or without a leading و ل لل ال", () => {
    expect(known("أحمد")).toBe(true);
    expect(known("لأحمد")).toBe(true);
    expect(known("واحمد")).toBe(true);
    expect(known("محمد")).toBe(true);
    expect(known("لمحمد علي")).toBe(true);
    expect(known("للحاج سيد")).toBe(true);
    expect(known("مونمون")).toBe(true);
  });

  it("does not match someone else", () => {
    expect(known("محمود")).toBe(false);
    expect(known("سيد")).toBe(false);
    expect(known("")).toBe(false);
    expect(personMatcher([])("أحمد")).toBe(false);
  });
});

describe("the reverse of the bridge", () => {
  it("returns every stored pair to a v2 answer that stores it again", () => {
    for (const category of TAXONOMY) {
      for (const sub of category.subs) {
        const stored = storedFiling(category.id, sub.id);
        const back = v2OfStored(stored.category, stored.subCategory);
        expect(back, `${stored.category}/${stored.subCategory}`).not.toBeNull();
        expect(storedFiling(back!.category, back!.sub)).toEqual(stored);
      }
    }
  });

  it("prefers a real subcategory, then the category that owns the stored name", () => {
    expect(v2OfStored("أكل وشرب", "بقالة")).toEqual({ category: "groceries", sub: "vegetables_fruits" });
    expect(v2OfStored("أقساط وفوايد", "أقساط")).toEqual({ category: "financial_fees", sub: "installment" });
    expect(v2OfStored("تحويل", "دين/سلفة")).toEqual({ category: "debts", sub: "other" });
    expect(v2OfStored("سكن", "ايجار")).toEqual({ category: "housing", sub: "rent" });
    expect(v2OfStored("مواصلات", null)).toEqual({ category: "transport", sub: "other" });
  });

  it("knows nothing of a free-text subcategory or a person's name", () => {
    expect(v2OfStored("العائلة", "أحمد أخوك")).toBeNull();
    expect(v2OfStored("تسوق", "حاجة غريبة")).toBeNull();
  });
});

describe("loading a context from the database", () => {
  const user = { id: 42, type: "local" as const };
  const now = new Date("2026-11-11T10:00:00Z");

  beforeEach(() => {
    fake.queries.length = 0;
    fake.failing.clear();
    fake.rows = {
      user_contacts: [
        { id: 9, name: "فريدة", relation: "صاحبة", aliases: null, isSilenced: false },
        { id: 10, name: "سامح", relation: null, aliases: ["سموحة"], isSilenced: true },
      ],
      scheduled_cashflows: [
        {
          id: 1, userId: 42, userType: "local", businessId: null, kind: "rent", direction: "out", title: "إيجار الشقة", amount: "3000",
          recurrence: "monthly", startDay: "2026-01-05", endDay: null, certainty: "confirmed", source: "user", installmentPlanId: null,
          contactId: null, shape: "recurring", provider: null, catalogSlug: null, beneficiaryContactId: null, intervalCount: 1,
          occurrenceCount: null, paidBeforeCount: 0, totalAmount: null, amountVaries: false, paymentMethod: null, gam3eyaTurn: null,
          parentId: null, category: null, subCategory: null, originExpenseId: null, remindDaysBefore: null, remindHour: null,
          remindersEnabled: true, status: "active", createdAt: new Date("2026-01-01T10:00:00Z"), updatedAt: null,
        },
        {
          id: 2, userId: 42, userType: "local", businessId: null, kind: "debt", direction: "out", title: "دين فريدة", amount: null,
          recurrence: "once", startDay: null, endDay: null, certainty: "confirmed", source: "user", installmentPlanId: null,
          contactId: 9, shape: "balance", provider: null, catalogSlug: null, beneficiaryContactId: null, intervalCount: 1,
          occurrenceCount: null, paidBeforeCount: 0, totalAmount: "1000", amountVaries: false, paymentMethod: null, gam3eyaTurn: null,
          parentId: null, category: null, subCategory: null, originExpenseId: null, remindDaysBefore: null, remindHour: null,
          remindersEnabled: true, status: "active", createdAt: new Date("2026-03-01T10:00:00Z"), updatedAt: null,
        },
      ],
      cashflow_settlements: [{ cashflowId: 1, dueDay: "2026-10-05", amount: "3000", expenseId: 77 }],
      user_wallets: [{ id: 7, name: "CIB Visa" }],
      user_correction_rules: [{ pattern: "اوبر", category: "مواصلات", subCategory: "أوبر/كريم", createdAt: new Date("2026-10-01") }],
      user_dictionaries: [{ word: "الجيم", category: "ترفيه", subCategory: "رياضة وجيم", createdAt: new Date("2026-09-01") }],
      expenses: [{ category: "فواتير", subCategory: "إنترنت" }, { category: "فواتير", subCategory: "إنترنت" }],
      user_businesses: [{ id: 3 }],
      business_categories: [{ name: "Fabric", nameAr: "قماش" }],
    };
  });

  it("loads every part, each filtered on the user's id and type", async () => {
    const ctx = await loadReadingContext(user, { now });

    expect(ctx).toMatchObject({ today: "2026-11-11", weekday: "Wednesday", businessMode: false, businessCategories: [], degraded: [] });
    expect(ctx.people).toEqual([{ name: "فريدة", relation: "صاحبة" }]);
    expect(ctx.isKnownPerson("لسموحة")).toBe(true);
    expect(ctx.commitments.map((item) => [item.ref, item.title, item.amount, item.dueDay, item.person])).toEqual([
      ["c1", "إيجار الشقة", 3000, "2026-11-05", null],
      ["c2", "دين فريدة", 1000, null, "فريدة"],
    ]);
    expect(ctx.commitmentRefs.get("c2")).toEqual({ cashflowId: 2, dueDay: "2026-03-01" });
    expect(ctx.walletRefs.get("w1")).toBe(7);
    expect(ctx.vocabulary).toEqual([
      { phrase: "اوبر", category: "transport", sub: "ride_apps" },
      { phrase: "الجيم", category: "entertainment", sub: "sports_gym" },
    ]);
    expect(ctx.isFamiliar("bills", "internet_landline")).toBe(true);
    expect(fake.queries.some((query) => query.table === "user_businesses")).toBe(false);

    // The schedule engine's own detail reads (items, overrides) are outside this file; everything else is bounded.
    const own = fake.queries.filter((query) => !["commitment_schedule_items", "commitment_overrides"].includes(query.table));
    expect(own.map((query) => query.table).sort()).toEqual([
      "cashflow_settlements", "expenses", "scheduled_cashflows", "user_contacts", "user_contacts",
      "user_correction_rules", "user_dictionaries", "user_wallets",
    ]);
    for (const query of fake.queries) {
      const { sql, params } = rendered(query);
      expect(sql, query.table).toContain("`user_id` = ?");
      expect(sql, query.table).toContain("`user_type` = ?");
      expect(params, query.table).toEqual(expect.arrayContaining([42, "local"]));
    }
    for (const query of own) expect(query.limit, query.table).toBeGreaterThan(0);

    const personal = own.filter((query) => ["scheduled_cashflows", "expenses"].includes(query.table));
    for (const query of personal) expect(rendered(query).sql, query.table).toContain("`business_id` is null");
  });

  it("adds the business's categories in business mode and stops leaving business rows out", async () => {
    const ctx = await loadReadingContext(user, { now, businessMode: true });
    expect(ctx.businessCategories).toEqual(["قماش"]);
    const commitments = fake.queries.find((query) => query.table === "scheduled_cashflows")!;
    expect(rendered(commitments).sql).not.toContain("business_id");
    expect(fake.queries.find((query) => query.table === "business_categories")?.limit).toBeGreaterThan(0);
  });

  it("leaves a part empty when its query fails, and keeps the rest", async () => {
    fake.failing.add("user_wallets");
    fake.failing.add("scheduled_cashflows");
    const ctx = await loadReadingContext(user, { now });
    expect(ctx.degraded).toEqual(["commitments", "wallets"]);
    expect(ctx.wallets).toEqual([]);
    expect(ctx.commitments).toEqual([]);
    expect(ctx.people).toHaveLength(1);
    expect(ctx.vocabulary).toHaveLength(2);
  });
});
