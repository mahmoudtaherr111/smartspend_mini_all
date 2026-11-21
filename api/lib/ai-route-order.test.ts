import { describe, expect, it, vi } from "vitest";

vi.mock("../queries/connection", () => ({ db: {} }));

const { applyListOrder, orderRouteModels, sortRouteModels } = await import("./ai-gateway");

const model = (id: number, over: Partial<{ providerId: number; purposes: string[]; allowedTiers: string[]; isDefaultForPurpose: boolean; sortOrder: number }> = {}) => ({
  id,
  providerId: 1,
  purposes: ["sms"],
  allowedTiers: ["free", "pro", "ultra"],
  isDefaultForPurpose: false,
  sortOrder: 0,
  ...over,
});

describe("the order models are asked in", () => {
  it("keeps every model of a purpose and plan, not one, so the fallbacks the admin added run", () => {
    const lists = orderRouteModels([model(1, { sortOrder: 20 }), model(2, { sortOrder: 10 }), model(3, { sortOrder: 30 })], new Map());
    expect(lists.get("sms:free")?.map((row) => row.id)).toEqual([2, 1, 3]);
  });

  it("never offers a model kept for another plan", () => {
    const lists = orderRouteModels([model(1, { allowedTiers: ["pro"] }), model(2, { allowedTiers: ["free"] })], new Map());
    expect(lists.get("sms:free")?.map((row) => row.id)).toEqual([2]);
    expect(lists.get("sms:pro")?.map((row) => row.id)).toEqual([1]);
  });

  it("puts a model marked default before the order, then breaks ties by the connector's priority", () => {
    const sorted = sortRouteModels([
      model(1, { providerId: 7, sortOrder: 10 }),
      model(2, { providerId: 8, sortOrder: 10 }),
      model(3, { sortOrder: 99, isDefaultForPurpose: true }),
    ], new Map([[7, 20], [8, 5]]));
    expect(sorted.map((row) => row.id)).toEqual([3, 2, 1]);
  });

  it("reorders one list without moving the models of any other list", () => {
    // One order: A B C D. The bank-message list holds A and C; the chat list holds B and D.
    const next = applyListOrder([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], [3, 1]);
    expect(next.map((row) => row.id)).toEqual([3, 2, 1, 4]);
  });
});
