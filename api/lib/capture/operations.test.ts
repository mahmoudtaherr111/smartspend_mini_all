import { describe, expect, it } from "vitest";
import { BREAKER_MIN_AUTO, breakerTrips } from "./operations";

describe("the breaker", () => {
  it("stops a bank whose recordings on their own are taken back more than one in twenty", () => {
    expect(
      breakerTrips([
        { sourceSlug: "cib", auto: 20, undone: 2 },
        { sourceSlug: "nbe", auto: 40, undone: 2 },
        { sourceSlug: "qnb", auto: 100, undone: 5 },
      ]),
    ).toEqual(["cib"]);
  });

  it("waits for enough payments before it judges a bank", () => {
    expect(breakerTrips([{ sourceSlug: "cib", auto: BREAKER_MIN_AUTO - 1, undone: 10 }])).toEqual([]);
  });
});
