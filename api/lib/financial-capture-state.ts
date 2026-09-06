import {
  captureDraftSchema,
  captureEventSchema,
  CAPTURE_ISSUE_TEXT,
  type CaptureDraft,
  type CaptureQuestion,
} from "../../contracts/financial-capture";
import type { z } from "zod";
import type { captureAnswerSchema } from "../../contracts/financial-capture";
import { CATEGORIES } from "./category-registry";

export function captureQuestions(draft: CaptureDraft): CaptureQuestion[] {
  if (draft.ignoredReason) return [];
  const questions: CaptureQuestion[] = [];
  for (const event of draft.events) {
    const add = (code: string, field: CaptureQuestion["field"] = null) =>
      questions.push({
        eventId: event.id,
        field,
        code,
        text:
          CAPTURE_ISSUE_TEXT[code] ||
          "هناك تعارض في المصدر يحتاج مراجعة قبل الحفظ.",
        blocking: true,
      });
    if (event.amount === null) add("amount", "amount");
    else if (
      Math.abs(event.amount * 100 - Math.round(event.amount * 100)) > 0.00001
    )
      add("amount", "amount");
    if (!event.currency) add("currency", "currency");
    else if (event.currency !== "EGP") add("unsupported_currency");
    if (!event.occurredAt) add("occurredAt", "occurredAt");
    if (event.kind === "unknown") add("kind", "kind");
    else if (["refund", "debt"].includes(event.kind)) add("unsupported_kind");
    if (event.status === "unknown") add("status", "status");
    else if (event.status !== "realized") add(event.status);
    const category = CATEGORIES.find(
      (c) => c.name_ar === event.category && c.type === event.kind,
    );
    if (!category) add("category", "category");
    else if (
      event.subCategory &&
      event.subCategory !== "عام" &&
      !category.subcategories.some((s) => s.name_ar === event.subCategory)
    )
      add("category", "subCategory");
    for (const issue of event.issues)
      add(issue, issue === "multiple_amounts" ? "amount" : null);
  }
  for (const issue of draft.issues)
    questions.push({
      eventId: null,
      field: null,
      code: issue,
      text: CAPTURE_ISSUE_TEXT[issue] || "المصدر يحتاج مراجعة قبل الحفظ.",
      blocking: true,
    });
  return questions;
}

/** Typed, field-bound replies. Neither a free text reply nor a model can change identity or neighbouring events. */
export function applyCaptureAnswer(
  draft: CaptureDraft,
  answer: z.infer<typeof captureAnswerSchema>,
): CaptureDraft {
  const index = draft.events.findIndex((e) => e.id === answer.eventId);
  if (index < 0) throw new Error("CAPTURE_EVENT_NOT_FOUND");
  const before = draft.events[index];
  // A pending/rejected payment cannot be made settled by answering an unrelated question.
  if (answer.field === "status" && before.status !== "unknown")
    throw new Error("CAPTURE_SOURCE_STATUS_IMMUTABLE");
  const event = captureEventSchema.parse({
    ...before,
    [answer.field]: answer.value,
  });
  if (answer.field === "category" || answer.field === "kind")
    event.subCategory = null;
  if (answer.field === "kind") event.category = null;
  if (answer.field === "amount")
    event.issues = event.issues.filter((i) => i !== "multiple_amounts");
  const events = draft.events.map((e, i) => (i === index ? event : e));
  return captureDraftSchema.parse({ ...draft, events });
}

export function assertCaptureReady(draft: CaptureDraft): void {
  if (
    draft.ignoredReason ||
    !draft.events.length ||
    captureQuestions(draft).some((q) => q.blocking)
  )
    throw new Error("CAPTURE_NOT_READY");
  if (new Set(draft.events.map((e) => e.id)).size !== draft.events.length)
    throw new Error("CAPTURE_DUPLICATE_EVENT_ID");
}
