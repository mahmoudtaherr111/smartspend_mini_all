import { describe, expect, it, vi } from "vitest";
import type { TranscriptLine } from "./gateway/store";
import { memoryPrompt, readCallMemory, summarizeCall, type CallMemory, type ExistingMemory, type PostCallDeps } from "./post-call";

const existing: ExistingMemory[] = [{ id: 41, type: "plan", content: "بيحوش لعربية" }];

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
  it("keeps at most five facts, only known ids as replaced, and a sane importance", () => {
    const facts = Array.from({ length: 7 }, (_, i) => ({ type: "fact", content: `حقيقة رقم ${i} مهمة`, importance: 500, replaces: 99 }));
    const memory = readCallMemory(JSON.stringify({ summary: "  ملخص\nقصير ", facts }), existing)!;
    expect(memory.summary).toBe("ملخص قصير");
    expect(memory.facts).toHaveLength(5);
    expect(memory.facts[0]).toEqual({ type: "fact", content: "حقيقة رقم 0 مهمة", importance: 90, replaces: null });
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
    expect(prompt).toContain("[41] (plan) بيحوش لعربية");
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
