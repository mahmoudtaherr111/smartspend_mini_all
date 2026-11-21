import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { refreshLedgerViews } from "@/lib/ledger-refresh";
import { formatCurrency } from "@/i18n/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";

type Question = NonNullable<
  inferRouterOutputs<AppRouter>["capture"]["nextQuestion"]
>;
const STATE_LABELS: Record<string, string> = {
  processing: "بنقرأ الرسالة",
  waiting: "منتظرين دليل يكمل بيانات العملية",
  held: "محجوزة لحد ما حد الباقة يتاح",
  recorded: "اتسجلت",
  removed: "اتشالت",
  review: "مراجعة قديمة",
};

/** Automatic capture stays visible; purpose is optional and only changes a row already saved. */
export function CaptureOverview() {
  const utils = trpc.useUtils();
  const status = trpc.capture.status.useQuery(undefined, { staleTime: 60_000 });
  const enabled =
    status.data?.mode === "automatic" &&
    status.data.enabled &&
    status.data.consent.capture;
  const activity = trpc.capture.activity.useQuery(
    { limit: 8 },
    {
      enabled: !!enabled,
      refetchInterval: (query) =>
        query.state.data?.some((item) => item.state === "processing")
          ? 5000
          : 30_000,
      refetchIntervalInBackground: false,
    },
  );
  const load = trpc.capture.nextQuestion.useMutation();
  const answer = trpc.capture.answerQuestion.useMutation({
    onSuccess: () => {
      refreshLedgerViews(utils);
      void utils.capture.activity.invalidate();
      load.reset();
      load.mutate();
    },
    onError: (error) =>
      toast.error(error.message || "ماقدرناش نعدّل التصنيف، جرّب تاني"),
  });
  const undo = trpc.capture.answer.useMutation({
    onSuccess: () => {
      refreshLedgerViews(utils);
      void utils.capture.invalidate();
      load.reset();
      load.mutate();
    },
    onError: (error) =>
      toast.error(error.message || "ماقدرناش نتراجع، جرّب تاني"),
  });
  const canAsk = !!enabled && status.data?.questionsEnabled === true;
  const loadQuestion = load.mutate;
  useEffect(() => {
    if (canAsk) loadQuestion();
  }, [canAsk, loadQuestion]);
  const recorded =
    activity.data
      ?.filter((item) => item.state === "recorded")
      .map((item) => item.key)
      .join("|") ?? "";
  const lastRecorded = useRef(recorded);
  useEffect(() => {
    if (recorded !== lastRecorded.current) {
      lastRecorded.current = recorded;
      refreshLedgerViews(utils);
    }
  }, [recorded, utils]);
  if (!enabled) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">رسايل البنك</CardTitle>
        <p className="text-sm text-muted-foreground">
          {status.data?.consent.aiReading ? "عملياتك بتتسجل تلقائيًا. لو بيانات الفلوس ناقصة، هنستنى دليل واضح." : "التسجيل التلقائي متوقف لحد ما توافق على القراءة. عملياتك المحفوظة موجودة وتقدر تعدّلها."}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {load.data && (
          <PurposeQuestion
            key={load.data.questionId}
            question={load.data}
            busy={answer.isPending}
            onAnswer={(value) =>
              answer.mutate({ questionId: load.data!.questionId, ...value })
            }
          />
        )}
        {load.isError && (
          <Button variant="outline" onClick={() => load.mutate()}>
            جرّب تحميل سؤال التصنيف تاني
          </Button>
        )}
        {activity.isError && (
          <Button variant="outline" onClick={() => void activity.refetch()}>
            جرّب تحميل حالة العمليات تاني
          </Button>
        )}
        <ul className="space-y-2" aria-label="حالة تسجيل رسايل البنك">
          {activity.data?.map((item) => (
            <li
              key={item.key}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
            >
              <span>
                {STATE_LABELS[item.state] ?? "بنتابع العملية"}
                {item.amountEgp !== null
                  ? ` · ${formatCurrency(item.amountEgp)}`
                  : ""}
              </span>
              {item.canUndo && item.eventId && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={undo.isPending}
                  onClick={() =>
                    undo.mutate({ eventId: item.eventId!, action: "undo" })
                  }
                >
                  تراجع
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function PurposeQuestion({
  question,
  busy,
  onAnswer,
}: {
  question: Question;
  busy: boolean;
  onAnswer: (answer: {
    action: "set" | "keep" | "skip";
    categoryId?: string;
    subCategoryId?: string;
    purpose?: string;
    movementKind?: "own_transfer" | "card_payment";
    contactId?: number;
  }) => void;
}) {
  const [categoryId, setCategoryId] = useState("");
  const [subCategoryId, setSubCategoryId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [contactId, setContactId] = useState("");
  const contacts = trpc.profile.listContacts.useQuery(undefined, { enabled: categoryId === "transfer" && subCategoryId === "debt" });
  const category = question.categories.find((item) => item.id === categoryId);
  return (
    <form
      className="space-y-3 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onAnswer({
          action: "set",
          categoryId: categoryId || undefined,
          subCategoryId: subCategoryId || undefined,
          purpose: purpose.trim() || undefined,
          contactId: categoryId === "transfer" && subCategoryId === "debt" && contactId ? Number(contactId) : undefined,
        });
      }}
    >
      <p className="font-medium">
        اتسجلت{" "}
        {formatCurrency(
          question.amountEgp +
            (question.direction === "out" ? question.feeEgp : 0),
        )}
        . تحب تحدد كانت في إيه؟
      </p>
      <p className="text-sm text-muted-foreground break-words">
        {question.title} · اختياري، العملية محفوظة بالفعل.
      </p>
      <label className="block text-sm">
        الفئة
        <select
          className="mt-1 w-full rounded-md border bg-background p-2"
          value={categoryId}
          disabled={busy}
          onChange={(event) => {
            setCategoryId(event.target.value);
            setSubCategoryId("");
          }}
        >
          <option value="">اختار فئة</option>
          {question.categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      {category && (
        <label className="block text-sm">
          الفئة الفرعية
          <select
            className="mt-1 w-full rounded-md border bg-background p-2"
            value={subCategoryId}
            disabled={busy}
            onChange={(event) => setSubCategoryId(event.target.value)}
          >
            <option value="">عام</option>
            {category.subcategories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {categoryId === "transfer" && subCategoryId === "debt" && <label className="block text-sm">الشخص (اختياري)<select className="mt-1 w-full rounded-md border bg-background p-2" value={contactId} disabled={busy} onChange={(event) => setContactId(event.target.value)}><option value="">لسه مش متحدد</option>{contacts.data?.contacts.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
      <Input
        aria-label="الغرض من العملية"
        placeholder="أو اكتب الغرض، زي مصاريف حضانة"
        maxLength={200}
        value={purpose}
        disabled={busy}
        onChange={(event) => setPurpose(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={busy || (!categoryId && !purpose.trim())}
        >
          احفظ التصنيف
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            onAnswer({ action: "set", movementKind: "own_transfer" })
          }
        >
          بين حساباتي
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            onAnswer({ action: "set", movementKind: "card_payment" })
          }
        >
          سداد بطاقتي
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => onAnswer({ action: "keep" })}
        >
          سيب التصنيف زي ما هو
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => onAnswer({ action: "skip" })}
        >
          تخطي
        </Button>
      </div>
    </form>
  );
}
