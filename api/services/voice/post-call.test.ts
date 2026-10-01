import { describe, expect, it, vi } from "vitest";
import type { TranscriptLine } from "./gateway/store";
import { memoryPrompt, readCallMemory, summarizeCall, type CallMemory, type ExistingMemory, type PostCallDeps } from "./post-call";

const existing: ExistingMemory[] = [
  { id: 41, type: "plan", content: "بيحوش لعربية", slot: "goal:car", day: "2026-09-01" },
  { id: 42, type: "followup", content: "هيشوف قيمة القسط ويقولها", slot: "followup:installment_amount", day: "2026-09-20" },
];

const words: TranscriptLine[] = [
  { role: "user", text: "أنا بحوش عشان أجيب عربية السنة الجاية، ومرتبي بينزل يوم 25" },
  { role: "assistant", text: "تمام، يبقى نحط ميزانية للحوش." },
];

function fakeDeps(overrides: Partial<PostCallDeps> & { answer?: string } = {}) {
  const state = { status: "pending", transcript: words as TranscriptLine[] | null, written: null as CallMemory | null, attempts: 0 };
  const deps: PostCallDeps = {
    loadCall: async () => ({ userId: 7, userType: "local", endedAt: new Date("2026-09-23T10:00:00Z") }),
    claim: async () => {
      if (state.status !== "pending") return false;
      state.status = "writing";
      return true;
    },
    setStatus: async (_callId, status) => {
      state.status = status;
    },
    readTranscript: async () => state.transcript,
    deleteTranscript: async () => {
      state.transcript = null;
    },
    existing: async () => existing,
    ask: vi.fn(async () => ({
      text:
        overrides.answer ??
        JSON.stringify({
          summary: "اتكلم عن الحوش للعربية وميعاد المرتب.",
          facts: [
            { type: "plan", content: "بيحوش لعربية السنة الجاية", importance: 80, replaces: 41 },
            { type: "fact", content: "مرتبه بينزل يوم 25", importance: 70, replaces: null },
          ],
        }),
    })),
    write: async (_user, _callId, memory) => {
      state.written = memory;
    },
    attempt: async () => ++state.attempts,
    ...overrides,
  };
  return { deps, state };
}

describe("readCallMemory", () => {
  it("keeps at most six facts, only known ids as replaced, and a sane importance", () => {
    const facts = Array.from({ length: 8 }, (_, i) => ({ type: "fact", content: `حقيقة رقم ${i} مهمة`, importance: 500, replaces: 99 }));
    const memory = readCallMemory(JSON.stringify({ summary: "  ملخص\nقصير ", facts }), existing)!;
    expect(memory.summary).toBe("ملخص قصير");
    expect(memory.facts).toHaveLength(6);
    expect(memory.facts[0]).toEqual({ type: "fact", content: "حقيقة رقم 0 مهمة", importance: 90, replaces: null, slot: null });
  });

  it("keeps a registered slot, drops an invented one, and lets a refusal or follow-up slot set the type", () => {
    const memory = readCallMemory(JSON.stringify({
      summary: "",
      facts: [
        { type: "fact", slot: "INCOME.PAYDAY", content: "مرتبه بينزل يوم 25", importance: 70 },
        { type: "fact", slot: "mood.today", content: "كان متضايق من الشغل", importance: 40 },
        { type: "fact", slot: "refusal:food_budget", content: "مش عايز ميزانية للأكل دلوقتي", importance: 60 },
        { type: "plan", slot: "goal:Phone!", content: "بيحوش لموبايل بتلاتين ألف", importance: 70 },
      ],
      closes: [42, 41, 7],
    }), existing)!;
    expect(memory.facts.map((fact) => [fact.type, fact.slot])).toEqual([
      ["fact", "income.payday"],
      ["fact", null],
      ["refusal", "refusal:food_budget"],
      ["plan", null],
    ]);
    // Only an existing follow-up can be closed.
    expect(memory.closes).toEqual([42]);
  });

  it("drops what is never kept, whatever the model says", () => {
    const memory = readCallMemory(
      '```json\n{"summary": "", "facts": [{"type": "fact", "content": "عمره 34 سنة ومواليد 1992"}, {"type": "fact", "content": "هو شخص مسرف"}, {"type": "preference", "content": "بيحب الأرقام بالتقريب"}]}\n```',
      existing,
    )!;
    expect(memory.facts.map((fact) => fact.content)).toEqual(["بيحب الأرقام بالتقريب"]);
  });

  it("returns null for an answer that is not JSON", () => {
    expect(readCallMemory("مش عارف", existing)).toBeNull();
  });
});

describe("memoryPrompt", () => {
  it("shows the model what is already remembered, with ids, and the call's words", () => {
    const prompt = memoryPrompt(words, existing);
    expect(prompt).toContain("[41] (plan, goal:car, 2026-09-01) بيحوش لعربية");
    expect(prompt).toContain("المستخدم: أنا بحوش");
    expect(prompt).toContain("المساعد: تمام");
  });
});

describe("summarizeCall", () => {
  it("writes the summary and facts, then deletes the words", async () => {
    const { deps, state } = fakeDeps();
    expect(await summarizeCall("vc_1", deps)).toBe("saved");
    expect(state.written?.facts.map((fact) => fact.replaces)).toEqual([41, null]);
    expect(state.transcript).toBeNull();
    expect(state.status).toBe("saved");
  });

  it("does nothing when another server already took the call", async () => {
    const { deps, state } = fakeDeps();
    state.status = "writing";
    expect(await summarizeCall("vc_1", deps)).toBe("skipped");
    expect(deps.ask).not.toHaveBeenCalled();
  });

  it("marks a call whose words are gone as expired", async () => {
    const { deps, state } = fakeDeps();
    state.transcript = null;
    expect(await summarizeCall("vc_1", deps)).toBe("expired");
    expect(state.status).toBe("expired");
  });

  it("does not ask the model about a call where the user said almost nothing", async () => {
    const { deps, state } = fakeDeps();
    state.transcript = [{ role: "user", text: "آلو" }, { role: "assistant", text: "أهلاً، محتاج إيه؟" }];
    expect(await summarizeCall("vc_1", deps)).toBe("empty");
    expect(deps.ask).not.toHaveBeenCalled();
    expect(state.transcript).toBeNull();
  });

  it("keeps the words for another try after a failure, and drops them after the third", async () => {
    const { deps, state } = fakeDeps({ answer: "not json" });
    expect(await summarizeCall("vc_1", deps)).toBe("retry");
    expect(state.status).toBe("pending");
    expect(state.transcript).not.toBeNull();
    await summarizeCall("vc_1", deps);
    expect(await summarizeCall("vc_1", deps)).toBe("failed");
    expect(state.status).toBe("failed");
    expect(state.transcript).toBeNull();
  });
});

describe("what the user forgot", () => {
  const forgot: TranscriptLine[] = [...words, { role: "forgotten", text: "مرتبه بينزل يوم 25" }];

  it("is named to the model apart from the words, and never kept whatever the model answers", async () => {
    const { deps, state } = fakeDeps({ readTranscript: async () => forgot });
    expect(await summarizeCall("vc_1", deps)).toBe("saved");
    const prompt = String(vi.mocked(deps.ask).mock.calls[0][1]);
    expect(prompt).toContain("FORGOTTEN:\n- مرتبه بينزل يوم 25");
    expect(prompt.split("CALL:")[1]).not.toContain("forgotten");
    // The model kept it anyway: the answer is held to the rule.
    expect(state.written!.facts.map((fact) => fact.content)).toEqual(["بيحوش لعربية السنة الجاية"]);
  });

  it("is honoured when it is forgotten while the model answers, and nothing is kept once everything was", async () => {
    const reads = [words, forgot];
    const late = fakeDeps({ readTranscript: async () => reads.shift() ?? forgot });
    await summarizeCall("vc_1", late.deps);
    expect(late.state.written!.facts.map((fact) => fact.content)).toEqual(["بيحوش لعربية السنة الجاية"]);

    const cleared = [words, null];
    const all = fakeDeps({ readTranscript: async () => (cleared.length ? cleared.shift()! : null) });
    expect(await summarizeCall("vc_1", all.deps)).toBe("empty");
    expect(all.state.written).toBeNull();
  });

  it("drops a summary that says it again", () => {
    const memory = readCallMemory(JSON.stringify({ summary: "مرتبه بينزل يوم 25 وبيحوش", facts: [] }), existing, ["مرتبه بينزل يوم 25"]);
    expect(memory!.summary).toBe("");
  });
});
