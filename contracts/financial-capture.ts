import { z } from "zod";
import { ExpenseInputLimits } from "./constants";

// The source and observed facts survive every question. Unknown is not zero/today/expense.
export const captureChannelSchema = z.enum([
  "text",
  "voice",
  "image",
  "sms",
  "android_notification",
  "ios_shortcut",
]);
export const captureKindSchema = z.enum([
  "expense",
  "income",
  "transfer",
  "investment",
  "refund",
  "debt",
  "unknown",
]);
export const captureEventSchema = z.object({
  id: z.string().min(1).max(64),
  description: z.string().max(ExpenseInputLimits.descriptionMax),
  amount: z
    .number()
    .finite()
    .positive()
    .max(ExpenseInputLimits.amountMax)
    .nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  occurredAt: z.iso.datetime({ offset: true }).nullable(),
  kind: captureKindSchema,
  category: z.string().max(100).nullable(),
  subCategory: z.string().max(100).nullable(),
  merchant: z.string().max(200).nullable(),
  billingContext: z
    .enum(["renewal", "recurring", "unspecified"])
    .default("unspecified"),
  status: z.enum(["realized", "pending", "rejected", "unknown"]),
  evidence: z.string().max(5000),
  issues: z.array(z.string().max(100)).max(30),
});
export const captureDraftSchema = z.object({
  schemaVersion: z.literal(1),
  channel: captureChannelSchema,
  sourceText: z.string().max(12000),
  receivedAt: z.iso.datetime({ offset: true }),
  events: z.array(captureEventSchema).max(50),
  issues: z.array(z.string().max(100)).max(30),
  ignoredReason: z.string().max(100).nullable(),
  businessId: z.number().int().positive().nullable(),
  // No pixels/audio/credentials in durable drafts.
  sourceMetadata: z
    .object({
      sender: z.string().max(100).optional(),
      provider: z.string().max(100).optional(),
    })
    .default({}),
});
export type CaptureDraft = z.infer<typeof captureDraftSchema>;
export type CaptureEvent = z.infer<typeof captureEventSchema>;
export type CaptureChannel = z.infer<typeof captureChannelSchema>;
export const captureFieldSchema = z.enum([
  "description",
  "amount",
  "currency",
  "occurredAt",
  "kind",
  "category",
  "subCategory",
  "merchant",
  "status",
]);
export type CaptureField = z.infer<typeof captureFieldSchema>;
export const captureAnswerSchema = z
  .object({
    captureId: z.string().uuid(),
    version: z.number().int().positive(),
    eventId: z.string().min(1).max(64),
    field: captureFieldSchema,
    value: z.union([z.string().max(2000), z.number().finite(), z.null()]),
  })
  .strict();
export const captureReceiptSchema = z.object({
  captureId: z.string().uuid(),
  version: z.number().int().positive(),
  events: z.array(
    z.object({
      eventId: z.string(),
      expenseId: z.number().int().positive(),
      amount: z.number(),
      currency: z.literal("EGP"),
      category: z.string(),
      type: z.string(),
      occurredAt: z.string(),
    }),
  ),
});
export type CaptureReceipt = z.infer<typeof captureReceiptSchema>;
export type CaptureQuestion = {
  eventId: string | null;
  field: CaptureField | null;
  code: string;
  text: string;
  blocking: boolean;
};

export const CAPTURE_ISSUE_TEXT: Record<string, string> = {
  amount: "المبلغ المدفوع كام؟",
  currency: "العملية كانت بأي عملة؟",
  occurredAt: "العملية حصلت إمتى؟",
  kind: "دي مصروف، دخل، ولا تحويل؟",
  category: "الفلوس كانت مقابل إيه؟",
  status: "هل العملية تمت بالفعل؟",
  unsupported_currency:
    "الدفتر الحالي يدعم الجنيه المصري. احتفظنا بالعملة الأصلية؛ لا يمكن حفظها كجنيه بدون تحويل موثق.",
  unsupported_kind:
    "الاسترداد والدين يحتاجان ربطًا محاسبيًا بالعملية الأصلية. احتفظنا بالمسودة للمراجعة.",
  pending: "الإشعار يقول إن العملية قيد التنفيذ؛ انتظر تأكيدها قبل التسجيل.",
  rejected: "الإشعار يصف عملية مرفوضة. لا نسجلها كمصروف تم دفعه.",
  multiple_amounts:
    "في المصدر أكثر من مبلغ محتمل. راجع المبلغ الفعلي لكل عملية.",
  fee_requires_reconciliation:
    "المصدر فيه رسوم بجانب المبلغ؛ نحتاج تحديد هل هي داخله أم منفصلة. احتفظ بالمسودة؛ تقسيم الرسوم لم يُدعَم بعد في هذه الشاشة.",
  document_unpaid: "هذه فاتورة أو طلب دفع، وليست إثباتًا أن الدفع تم.",
  document_total_conflict:
    "الإجمالي لا يطابق مكونات الفاتورة. أعد رفع صورة أوضح، أو أدخل العملية يدويًا وتجاهل هذه المسودة.",
  source_truncated:
    "المصدر ناقص أو غير مقروء بالكامل. أعد إرسال المصدر كاملًا، أو أدخل العملية يدويًا وتجاهل هذه المسودة.",
  low_source_quality: "بعض تفاصيل المصدر غير واضحة؛ راجعها مع النص الأصلي.",
};
