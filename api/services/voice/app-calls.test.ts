import { beforeEach, describe, expect, it, vi } from "vitest";

// The adapter reads the caller's row and, after a save, the saved ids; both come from this fake.
const rows: { user: Record<string, unknown>[]; saved: Array<{ id: number }> } = { user: [], saved: [] };
vi.mock("../../queries/connection", () => {
  const chain = (result: () => unknown[]) => {
    const query: Record<string, unknown> = {};
    for (const step of ["from", "where", "orderBy"]) query[step] = () => query;
    query.limit = async () => result();
    query.then = (resolve: (value: unknown) => void) => resolve(result());
    return query;
  };
  let calls = 0;
  return {
    db: {
      select: () => chain(() => (calls++ % 2 === 0 ? rows.user : rows.saved)),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    },
  };
});

import { createVoiceAppCalls } from "./app-calls";

const identity = { callId: "vc_test0000000000", userId: 7, userType: "local" as const, plan: "pro", role: "user" };

describe("createVoiceAppCalls", () => {
  beforeEach(() => {
    rows.user = [{ id: 7, name: "منى", email: null, avatar: null, role: "user", plan: "pro", phone: "01000000000" }];
    rows.saved = [{ id: 900 }];
  });

  it("keeps debt contact ids available to the coach instead of discarding the ledger link", async () => {
    const app = createVoiceAppCalls({ createCaller: () => ({ expense: { getDebtBalances: async () => ({
      balances: [{ contactId: 41, name: "خالد", balance: -800, lent: 0, received: 800, count: 1, lastDate: new Date("2026-09-10T10:00:00Z") }],
      owedToYou: 0, youOwe: 800, gam3eya: { paid: 0, received: 0, held: 0, installments: 0 },
    }) } }) as never });
    expect((await app.debts(identity)).people).toEqual([expect.objectContaining({ contactId: 41, name: "خالد", balance: -800 })]);
  });

  it("keeps a refund's direction and the person beside the purpose from parse to save", async () => {
    const batchCreate = vi.fn(async () => ({ success: true, count: 1 }));
    const parseExpense = vi.fn(async () => ({
      decision: "review",
      items: [
        { amount: 300, type: "expense", category: "تسوق", direction: "incoming", person_mentioned: "أحمد", person_relationship: "صديق" },
        { amount: 500, type: "transfer", category: "سلف", direction: "outgoing" },
        { amount: 80, type: "expense", category: "أكل وشرب", direction: "outgoing" },
      ],
    }));
    const app = createVoiceAppCalls({
      createCaller: () => ({ ai: { parseExpense }, expense: { batchCreate } }) as never,
    });

    const parsed = await app.parseExpense(identity, "رجعت القميص لأحمد وخدت تلتمية");
    // An expense paid out carries no direction, exactly as the expense form saves it (contracts/expense-save.ts).
    expect(parsed.items.map((item) => ({ direction: item.direction, personName: item.personName }))).toEqual([
      { direction: "incoming", personName: "أحمد" },
      { direction: "outgoing", personName: undefined },
      { direction: undefined, personName: undefined },
    ]);

    await app.saveExpenses(identity, parsed.items.map((item, index) => ({ ...item, rawText: "x", clientRequestId: `vc:1:d:${index}` })));
    const sent = (batchCreate.mock.calls[0] as unknown as [Array<Record<string, unknown>>])[0];
    expect(sent[0]).toMatchObject({ direction: "incoming", personName: "أحمد", personRelationship: "صديق", source: "voice" });
    expect(sent[1]).toMatchObject({ type: "transfer", direction: "outgoing" });
    expect(sent[2].direction).toBeUndefined();
  });
});
