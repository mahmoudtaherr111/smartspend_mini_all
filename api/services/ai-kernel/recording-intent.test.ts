import { describe, expect, it } from "vitest";
import {
  explicitRecordingSentence, isOwnRecordedNarration, isRecordingClarificationReply, splitRecordingQuestion,
} from "./recording-intent";

describe("chat recording intent", () => {
  it.each([
    "صرفت ٣٥ جنيه ع الفطار",
    "امبارح انا دفعت ١٥٠ للنت واشتريت عيش",
    "حولت ٥٠٠ من البنك للمحفظة",
  ])("recognizes a completed narration: %s", (text) => {
    expect(isOwnRecordedNarration(text)).toBe(true);
  });

  it.each([
    "صرفت كام النهارده؟",
    "دفعت ٥٠ جنيه صح",
    "دفعت 100 عشان كنت ناوي اشتري جزم",
    "دفعت ماما ١٠٠ جنيه",
    "دفعت ١٠٠؟",
    "دفعت ١٠٠ وقاللي خليها ٥٠",
    "انا مادفعتش ١٠٠",
    "لو دفعت ١٠٠ ممكن يتسجل؟",
    "هدفع مية",
    "فاكر دفعت امبارح ١٠٠؟",
    "دفعت ٥٠ وقولي صرفت كام",
  ])("keeps references out of automatic recording: %s", (text) => {
    expect(isOwnRecordedNarration(text)).toBe(false);
  });

  it("extracts an explicit recording for review, excluding a question about recording", () => {
    expect(explicitRecordingSentence("سجل مصروف ٥٠ جنيه للنت")).toBe("مصروف ٥٠ جنيه للنت");
    expect(explicitRecordingSentence("إزاي أسجل مصروف ٥٠ جنيه للنت؟")).toBeNull();
  });

  it("splits only a completed narration with a clearly delimited question", () => {
    expect(splitRecordingQuestion("دفعت ٥٠ للفطار، وقولي صرفت كام النهارده؟")).toEqual({
      sentence: "دفعت ٥٠ للفطار", question: "قولي صرفت كام النهارده؟",
    });
    expect(splitRecordingQuestion("دفعت ٥٠ للفطار وصرفت كام النهارده؟")).toEqual({
      sentence: "دفعت ٥٠ للفطار", question: "صرفت كام النهارده؟",
    });
    expect(splitRecordingQuestion("لو دفعت ٥٠ للفطار، قولي صرفت كام النهارده؟")).toBeNull();
  });

  it("accepts a direct detail and keeps other chat turns out of the pending write", () => {
    const question = "«اشتريت عيش» كان بكام؟";
    expect(isRecordingClarificationReply("٥٠ جنيه", question)).toBe(true);
    expect(isRecordingClarificationReply("تلاتين جنيه", question)).toBe(true);
    expect(isRecordingClarificationReply("صرفت كام النهارده؟", question)).toBe(false);
    expect(isRecordingClarificationReply("تمام", question)).toBe(false);
    expect(isRecordingClarificationReply("احفظ", question)).toBe(false);
    expect(isRecordingClarificationReply("احفظ", "لو التفاصيل صح اكتب «احفظ»")).toBe(true);
  });
});
