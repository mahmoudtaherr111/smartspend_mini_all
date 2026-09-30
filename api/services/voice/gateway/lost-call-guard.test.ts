import { describe, expect, it } from "vitest";
import { claimsFailure } from "../brain/claims";
import { LostToolCallGuard } from "./lost-call-guard";

const pcm = (n = 4800) => Buffer.alloc(n);
const guard = () => new LostToolCallGuard({ claimsFailure, holdMs: 900, enoughChars: 28 });

describe("LostToolCallGuard", () => {
  it("drops the apology that follows a filler with no tool call, and asks for a retry", () => {
    const g = guard();
    g.newRequest();
    expect(g.audio(pcm(), 24_000, 0)).toEqual({ kind: "pass" }); // the filler itself
    expect(g.words("خليني أشوف رصيدك.", 10)).toEqual({ kind: "pass" });
    expect(g.utteranceEnded(true)).toEqual({ kind: "pass" });
    expect(g.audio(pcm(), 24_000, 3_000)).toEqual({ kind: "hold" });
    expect(g.words("يا فندم حصل خطأ ", 3_000)).toEqual({ kind: "hold" });
    expect(g.words("في النظام", 3_700)).toEqual({ kind: "drop", retry: true });
    // The rest of that utterance is dropped too, until the provider says it stopped.
    expect(g.audio(pcm(), 24_000, 3_800)).toEqual({ kind: "drop", retry: false });
    g.interrupted();
    expect(g.audio(pcm(), 24_000, 4_000)).toEqual({ kind: "pass" });
  });

  it("releases a real answer after the filler as soon as its words show it is not an apology", () => {
    const g = guard();
    g.newRequest();
    g.utteranceEnded(true);
    expect(g.audio(pcm(100), 24_000, 1_000)).toEqual({ kind: "hold" });
    const verdict = g.words("بص، المرتب بيروح أغلبه على الإيجار والأكل", 1_100);
    expect(verdict).toMatchObject({ kind: "release", words: ["بص، المرتب بيروح أغلبه على الإيجار والأكل"] });
    expect(verdict.kind === "release" && verdict.audio.length).toBe(1);
    expect(g.audio(pcm(), 24_000, 1_200)).toEqual({ kind: "pass" });
  });

  it("holds at most the hold time", () => {
    const g = guard();
    g.newRequest();
    g.utteranceEnded(true);
    g.audio(pcm(), 24_000, 0);
    g.words("طيب", 100);
    expect(g.tick(500)).toEqual({ kind: "pass" });
    expect(g.tick(900)).toMatchObject({ kind: "release", words: ["طيب"] });
  });

  it("never holds once the model called a tool for this request, nor before any filler", () => {
    const g = guard();
    g.newRequest();
    expect(g.audio(pcm(), 24_000, 0)).toEqual({ kind: "pass" });
    g.utteranceEnded(true);
    g.toolCalled();
    expect(g.audio(pcm(), 24_000, 5_000)).toEqual({ kind: "pass" });
    expect(g.words("حصل عطل", 5_000)).toEqual({ kind: "pass" });
  });

  it("lets an apology through when a tool really failed", () => {
    const g = guard();
    g.newRequest();
    g.utteranceEnded(true);
    g.toolAnswered(false);
    g.audio(pcm(), 24_000, 0);
    expect(g.words("للأسف حصل خطأ في النظام", 10)).toMatchObject({ kind: "release" });
  });

  it("stops asking for retries after two in one request, and starts again with the next request", () => {
    const g = guard();
    g.newRequest();
    for (const retry of [true, true, false]) {
      g.utteranceEnded(true);
      g.audio(pcm(), 24_000, 0);
      expect(g.words("حصل عطل في النظام", 10)).toEqual({ kind: "drop", retry });
      g.interrupted();
    }
    g.newRequest();
    g.utteranceEnded(true);
    g.audio(pcm(), 24_000, 0);
    expect(g.words("حصل عطل في النظام", 10)).toEqual({ kind: "drop", retry: true });
  });

  it("releases what it held when the utterance ends before the words decide", () => {
    const g = guard();
    g.newRequest();
    g.utteranceEnded(true);
    g.audio(pcm(), 24_000, 0);
    g.words("تمام", 10);
    expect(g.utteranceEnded(false)).toMatchObject({ kind: "release", words: ["تمام"] });
  });
});
