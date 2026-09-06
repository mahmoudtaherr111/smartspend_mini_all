import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { CaptureEvent, CaptureField } from "@contracts/financial-capture";

const fields: Array<[CaptureField, string]> = [
  ["amount", "المبلغ"],
  ["currency", "العملة"],
  ["occurredAt", "التاريخ والوقت"],
  ["kind", "نوع العملية"],
  ["category", "الفئة"],
  ["subCategory", "الفئة الفرعية"],
  ["description", "الوصف"],
  ["merchant", "التاجر"],
  ["status", "حالة الدفع"],
];
const kinds = [
  ["expense", "مصروف"],
  ["income", "دخل"],
  ["transfer", "تحويل"],
  ["investment", "استثمار"],
  ["refund", "استرداد"],
  ["debt", "دين"],
];
function EventReview({
  event,
  busy,
  taxonomy,
  onAnswer,
}: {
  event: CaptureEvent;
  busy: boolean;
  taxonomy: Array<{ name: string; type: string; subs: string[] }>;
  onAnswer: (field: CaptureField, value: string | number | null) => void;
}) {
  const [field, setField] = useState<CaptureField>(
    event.amount === null
      ? "amount"
      : !event.currency
        ? "currency"
        : !event.occurredAt
          ? "occurredAt"
          : event.kind === "unknown"
            ? "kind"
            : !event.category
              ? "category"
              : "description",
  );
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(false);
  const options =
    field === "kind"
      ? kinds
      : field === "category"
        ? taxonomy
            .filter((c) => c.type === event.kind)
            .map((c) => [c.name, c.name])
        : field === "subCategory"
          ? (
              taxonomy.find((c) => c.name === event.category)?.subs || ["عام"]
            ).map((s) => [s, s])
          : field === "status"
            ? [
                ["realized", "تم الدفع بالفعل"],
                ["pending", "قيد التنفيذ"],
                ["rejected", "مرفوضة"],
              ]
            : null;
  const changeField = (next: CaptureField) => {
    setField(next);
    setValue("");
  };
  const submit = () => {
    if (!value.trim()) return;
    if (field === "occurredAt") {
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) {
        toast.error("التاريخ غير صحيح");
        return;
      }
      onAnswer(field, date.toISOString());
    } else
      onAnswer(
        field,
        field === "amount"
          ? Number(value)
          : field === "currency"
            ? value.toUpperCase()
            : value,
      );
  };
  return (
    <article className="rounded-lg border p-3 space-y-2">
      <p className="font-medium">{event.description || "عملية تحتاج وصفًا"}</p>
      <p>
        {event.amount ?? "مبلغ ناقص"} {event.currency ?? "عملة غير محددة"} ·{" "}
        {event.category || "فئة غير محددة"}
      </p>
      <p className="text-xs text-muted-foreground">
        {kinds.find((k) => k[0] === event.kind)?.[1] || "نوع غير محدد"} ·{" "}
        {event.merchant || "تاجر غير محدد"} ·{" "}
        {event.occurredAt
          ? new Date(event.occurredAt).toLocaleString("ar-EG")
          : "تاريخ يحتاج تأكيدًا"}
      </p>
      {event.billingContext !== "unspecified" && (
        <p className="text-xs">
          {event.billingContext === "renewal"
            ? "المصدر يذكر تجديد اشتراك"
            : "المصدر يذكر دفعة متكررة"}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => setEditing(!editing)}
      >
        توضيح أو تعديل
      </Button>
      {editing && (
        <div className="space-y-2">
          <label className="block text-xs">
            الحقل المطلوب
            <select
              className="w-full rounded border bg-background p-2"
              value={field}
              onChange={(e) => changeField(e.target.value as CaptureField)}
            >
              {fields
                .filter(([f]) => f !== "status" || event.status === "unknown")
                .map(([f, label]) => (
                  <option key={f} value={f}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
          <label className="block text-xs">
            الإجابة
            {options ? (
              <select
                className="w-full rounded border bg-background p-2"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              >
                <option value="">اختر القيمة</option>
                {options.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                type={
                  field === "occurredAt"
                    ? "datetime-local"
                    : field === "amount"
                      ? "number"
                      : "text"
                }
                step={field === "amount" ? "0.01" : undefined}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={field === "currency" ? "EGP" : undefined}
              />
            )}
          </label>
          <Button
            type="button"
            size="sm"
            disabled={busy || !value.trim()}
            onClick={submit}
          >
            تطبيق الإجابة على هذه العملية
          </Button>
        </div>
      )}
    </article>
  );
}

/** Durable source → scoped answer → revalidation → actual receipt. Shared by image and notification UX. */
export function FinancialCaptureInbox({ onSaved }: { onSaved?: () => void }) {
  const utils = trpc.useUtils();
  const query = trpc.capture.list.useQuery(undefined, { retry: false });
  const taxonomy = trpc.capture.taxonomy.useQuery(undefined, {
    staleTime: 300_000,
  });
  const [open, setOpen] = useState<string | null>(null);
  const refresh = () => {
    void utils.capture.list.invalidate();
  };
  const onError = (e: { message: string }) => {
    toast.error(e.message);
    refresh();
  };
  const answer = trpc.capture.answer.useMutation({
    onSuccess: refresh,
    onError,
  });
  const dismiss = trpc.capture.dismiss.useMutation({
    onSuccess: refresh,
    onError,
  });
  const confirm = trpc.capture.confirm.useMutation({
    onError,
    onSuccess: (receipt) => {
      toast.success(`تم حفظ ${receipt.events.length} عملية`);
      refresh();
      void utils.expense.invalidate();
      onSaved?.();
    },
  });
  const busy = answer.isPending || dismiss.isPending || confirm.isPending;
  if (query.isError)
    return (
      <div role="status" className="text-sm rounded border p-3">
        تعذر تحميل المسودات.{" "}
        <Button type="button" variant="link" onClick={() => query.refetch()}>
          إعادة المحاولة
        </Button>
      </div>
    );
  if (!query.data?.length) return null;
  return (
    <section
      dir="rtl"
      aria-label="عمليات تحتاج مراجعة"
      className="rounded-xl border border-amber-300 p-3 space-y-3"
    >
      <h3 className="font-semibold">
        عمليات تحتاج مراجعة ({query.data.length})
      </h3>
      <p className="text-xs text-muted-foreground">
        محفوظة كمسودات ولم تدخل إجمالي المصروفات. راجع تفاصيل كل عملية قبل
        التأكيد.
      </p>
      {query.data.map((capture) => (
        <div key={capture.id} className="space-y-2">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start whitespace-normal h-auto"
            onClick={() => setOpen(open === capture.id ? null : capture.id)}
          >
            {capture.draft.sourceMetadata.sender ||
              (capture.draft.channel === "image"
                ? "صورة / إيصال"
                : "إشعار دفع")}{" "}
            — {capture.draft.events[0]?.description || "مصدر يحتاج مراجعة"}
          </Button>
          {open === capture.id && (
            <div className="space-y-3">
              <details>
                <summary className="cursor-pointer text-sm">
                  عرض النص الأصلي
                </summary>
                <pre
                  dir="auto"
                  className="whitespace-pre-wrap text-xs max-h-52 overflow-auto"
                >
                  {capture.draft.sourceText}
                </pre>
              </details>
              {capture.draft.events.map((event) => (
                <EventReview
                  key={`${event.id}:${capture.version}`}
                  event={event}
                  busy={busy}
                  taxonomy={taxonomy.data || []}
                  onAnswer={(field, value) =>
                    answer.mutate({
                      captureId: capture.id,
                      version: capture.version,
                      eventId: event.id,
                      field,
                      value,
                    })
                  }
                />
              ))}
              {!!capture.questions.length && (
                <ul className="list-disc ps-5 text-sm text-amber-800 dark:text-amber-200">
                  {capture.questions.map((q, i) => (
                    <li key={`${q.eventId}:${q.code}:${i}`}>
                      {q.eventId &&
                        `${capture.draft.events.find((e) => e.id === q.eventId)?.description || "عملية"}: `}
                      {q.text}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  disabled={
                    busy ||
                    !!capture.questions.length ||
                    !capture.draft.events.length
                  }
                  onClick={() =>
                    confirm.mutate({
                      captureId: capture.id,
                      version: capture.version,
                    })
                  }
                >
                  تأكيد وحفظ كل العمليات
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    dismiss.mutate({
                      captureId: capture.id,
                      version: capture.version,
                    })
                  }
                >
                  تجاهل المسودة
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
