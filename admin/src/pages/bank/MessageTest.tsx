import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@admin/kit/button";
import { Input } from "@admin/kit/input";
import { Textarea } from "@admin/kit/textarea";
import { trpc } from "@admin/lib/trpc";

// Invented messages in the shapes banks and wallets send; nobody's real data.
const EXAMPLES = [
  { label: "انستاباي", sender: "InstaPay", text: "You have successfully sent EGP 1,500.00 to mahmoud.ali@instapay from your account ***4410. Ref: IP77120034" },
  { label: "فودافون كاش", sender: "VF-Cash", text: "تم تحويل 250 جنيه من محفظتك الى 01012345678 بنجاح. رسوم العملية 1.5 جنيه. رصيدك الحالي 830.25 جنيه" },
  { label: "تحويل بنكي", sender: "NBE", text: "تحويل صادر بمبلغ 3,000.00 جنيه إلى حساب رقم ****3021 باسم Hany Lotfy - مصاريف تحويل 5.00 جنيه - الرصيد 12,103.30 جنيه" },
  { label: "كريدت كارد", sender: "CIB", text: "Your CIB Credit Card ending 0912 was used for EGP 2,999.00 at AMAZON.EG. Available limit: EGP 47,001.00" },
  { label: "ديبت كارد", sender: "BanqueMisr", text: "تم خصم مبلغ 340.50 ج.م من بطاقتكم المنتهية بـ 7723 لدى صيدلية العزبي الرصيد المتاح 2,115.20 ج.م" },
  { label: "Apple Pay", sender: "QNB", text: "Apple Pay: EGP 135.00 spent at COSTA COFFEE ZAMALEK with card ending 3381. Avl bal EGP 3,865.00" },
  { label: "فلوس جاتلك", sender: "VF-Cash", text: "استلمت 750 جنيه من 01198765432 (Mona Adel). رصيد محفظتك 1580.25 جنيه." },
  { label: "مرتب", sender: "NBE", text: "تم إضافة مبلغ 22,500.00 جنيه إلى حسابكم رقم ****7781 قيمة راتب شهر نوفمبر. الرصيد 24,118.30 جنيه" },
  { label: "سحب ATM", sender: "BanqueMisr", text: "سحب نقدى بمبلغ 3,000 جنيه من ماكينة الصراف الآلى بطاقة رقم ***4471. الرصيد المتاح 9,880.00" },
  { label: "بالدولار", sender: "CIB", text: "Your card ending 0912 was charged USD 20.00 at OPENAI *CHATGPT" },
  { label: "مرفوضة", sender: "AAIB", text: "AAIB: Transaction declined. EGP 4,500.00 at B.TECH NASR CITY, card **5512. Reason: insufficient balance." },
  { label: "كود تحقق", sender: "CIB", text: "Your one-time password for the online purchase of EGP 799.00 at JUMIA is 482913. Never share it." },
  { label: "عرض", sender: "NBE", text: "استمتع بخصم 20% على مشترياتك ببطاقات الأهلي حتى 30/11" },
];

/** Why nothing reached the ledger, in the words a person would use. */
const NOTHING: Record<string, string> = {
  personal_sender: "الرسالة جاية من رقم موبايل شخص، فمابتتقريش.",
  no_keyword: "مفيهاش ولا كلمة من كلمات الفلوس، فالموبايل أصلاً ماكانش هيبعتها.",
  otp: "دي كود تحقق: بيترمي على طول، مابيتحفظش ومابيروحش للذكاء الاصطناعي.",
  user_ignored: "ده كارت أو جملة المستخدم قال نتجاهلها.",
  redaction_failed: "ماقدرناش نخبّي البيانات اللي فيها، فاترفضت.",
  unknown_app: "التطبيق ده مش في قايمة البنوك والمحافظ.",
  not_transaction: "الذكاء الاصطناعي قال إنها مش عملية فلوس (عرض، رصيد، كشف حساب، تنبيه).",
  declined: "العملية اترفضت، فمفيش فلوس اتحركت.",
  on_hold: "ده مبلغ محجوز لسه ماتخصمش.",
  failed: "الذكاء الاصطناعي مش بيرد دلوقتي. الرسالة محفوظة وهتتقري أول ما يرجع.",
  invalid_reply: "رد الذكاء الاصطناعي ماعداش الفحص، وهنسأله تاني.",
  financial_upgrade: "الدفتر لسه بيتحوّل لنظام الدخل والصرف.",
  disabled: "تسجيل رسايل البنك مقفول من الإعدادات.",
};
const KIND: Record<string, string> = {
  purchase: "شراء", bill: "فاتورة", topup: "شحن رصيد", transfer: "تحويل", cash_withdrawal: "سحب نقدي", cash_deposit: "إيداع نقدي",
  refund: "مرتجع", reversal: "إلغاء عملية", salary: "مرتب", fee: "رسوم", interest: "فوايد", cashback: "كاش باك", card_payment: "سداد كارت",
  installment: "قسط", loan: "سلفة", other: "تاني",
};
const egp = (value: string | number | null | undefined) => `${Number(value ?? 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;

/**
 * One message, sent the way a phone sends it (only its text matters; the sender just names the bank), and the result
 * the way the user meets it: the notification on the phone, then the row in the app's list.
 */
export function MessageTest() {
  const [text, setText] = useState("");
  const [sender, setSender] = useState("");
  const simulate = trpc.captureAdmin.simulate.useMutation({ onError: (error) => toast.error(error.message) });
  const result = simulate.data;
  const notice = result?.job?.notice as { title?: string; body?: string; actions?: string[] } | null | undefined;
  const ledger = result?.ledger;
  const outcome = result?.admission.result === "queued" ? result.job?.outcome ?? null : result?.admission.reason ?? null;
  const waiting = result?.event?.status === "review";
  const total = ledger ? Number(ledger.amount) + Number(ledger.feeAmount ?? 0) : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="font-semibold">الرسالة</h2>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <Button key={example.label} size="sm" variant="outline" onClick={() => { setText(example.text); setSender(example.sender); }}>{example.label}</Button>
          ))}
        </div>
        <Textarea aria-label="نص الرسالة" rows={5} placeholder="الصق نص رسالة البنك أو المحفظة زي ما هو" value={text} onChange={(e) => setText(e.target.value)} dir="auto" />
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">الراسل (اختياري)</summary>
          <p className="mt-1 text-xs text-muted-foreground">
            الموبايل بيبعت اسم الراسل مع رسالة الـ SMS (زي QNB أو VF-Cash). بنستخدمه نعرف أنهي بنك عشان يظهر في السطر، ونرمي الرسايل اللي من أرقام ناس.
            المعنى نفسه بيتقري من نص الرسالة بس.
          </p>
          <Input className="mt-2" aria-label="الراسل" placeholder="QNB" value={sender} onChange={(e) => setSender(e.target.value)} dir="ltr" />
        </details>
        <Button className="w-full" disabled={simulate.isPending || text.trim().length < 3} onClick={() => simulate.mutate({ text, sender: sender || null, channel: "sms" })}>
          {simulate.isPending ? "بنقرا الرسالة…" : "ابعتها كأنها وصلت موبايلك"}
        </Button>
        <p className="text-xs text-muted-foreground">بتعدّي على نفس طريق رسالة الموبايل بالظبط، وبتتسجل في حسابك إنت.</p>
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="mb-3 font-semibold">اللي المستخدم هيشوفه</h2>
        {!result ? (
          <p className="text-sm text-muted-foreground">ابعت رسالة وهتظهر هنا زي ما بتظهر على الموبايل.</p>
        ) : (
          <div className="mx-auto max-w-sm space-y-3 rounded-[2rem] border-4 border-foreground/80 bg-muted/40 p-3">
            {notice ? (
              <div className="rounded-2xl bg-background p-3 shadow-sm">
                <div className="text-xs text-muted-foreground">SmartSpend · دلوقتي</div>
                <div className="mt-1 text-sm font-semibold" dir="auto">{notice.title}</div>
                <div className="text-sm" dir="auto">{notice.body}</div>
                {!!notice.actions?.length && (
                  <div className="mt-2 flex gap-3 text-sm font-semibold text-primary">
                    {notice.actions.map((action) => <span key={action}>{action === "undo" ? "تراجع" : action === "record" ? "سجّل" : "مش مصروف"}</span>)}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed bg-background p-3 text-center text-xs text-muted-foreground">مفيش إشعار ظهر على الموبايل</div>
            )}

            <div className="rounded-2xl bg-background p-3">
              <div className="mb-2 text-xs font-semibold text-muted-foreground">في التطبيق · العمليات</div>
              {ledger ? (
                <div className="flex items-center gap-3">
                  <div className={`grid size-10 shrink-0 place-items-center rounded-full text-lg ${ledger.type === "income" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`} aria-hidden>
                    {ledger.type === "income" ? "↓" : "↑"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold" dir="auto">{ledger.description}</div>
                    <div className="truncate text-xs text-muted-foreground" dir="auto">
                      {ledger.category} · {ledger.subCategory}{ledger.feeAmount ? ` · رسوم ${egp(ledger.feeAmount)}` : ""}
                    </div>
                    {ledger.excludedFromTotals && <div className="mt-0.5 text-xs text-amber-700">بين فلوسك وفلوسك: مش بتدخل في الصرف والدخل</div>}
                  </div>
                  <div className={`shrink-0 text-sm font-bold ${ledger.type === "income" ? "text-emerald-700" : "text-rose-700"}`}>
                    {ledger.type === "income" ? "+" : "−"}{egp(total)}
                  </div>
                </div>
              ) : waiting ? (
                <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                  مستنية المستخدم: هتظهر في «عمليات محتاجة ردك» {result.event?.possibleDuplicate ? "لأنها ممكن تكون نفس عملية قبلها." : "لأن ناقصها حاجة (زي المبلغ بالجنيه)."}
                </div>
              ) : (
                <div className="rounded-xl bg-muted p-3 text-sm">مفيش حاجة اتسجلت. {NOTHING[outcome ?? ""] ?? ""}</div>
              )}
            </div>
          </div>
        )}

        {result && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-medium">التفاصيل اللي ورا الشاشة</summary>
            <dl className="mt-2 space-y-1.5">
              <Detail label="السيرفر" value={result.admission.result === "queued" ? "قبلها وبعتها للذكاء الاصطناعي" : NOTHING[result.admission.reason ?? ""] ?? result.admission.reason} />
              {result.redacted && <Detail label="اللي راح للذكاء الاصطناعي" value={result.redacted} />}
              {result.reading?.facts && (
                <>
                  <Detail label="فهم إيه" value={`${KIND[result.reading.facts.kind] ?? result.reading.facts.kind} · ${result.reading.facts.flow === "out" ? "خارجة" : result.reading.facts.flow === "in" ? "داخلة" : "اتجاه مش معروف"} · ${result.reading.facts.amount ? `${result.reading.facts.amount.value} ${result.reading.facts.amount.currency}` : "من غير مبلغ"}`} />
                  <Detail label="الطرف التاني" value={result.reading.facts.party ?? "مش مكتوب"} />
                  <Detail label="الفئة اللي اقترحها" value={result.reading.facts.category ? `${result.reading.facts.category} / ${result.reading.facts.subcategory ?? "عام"}` : "ماعرفش، فبتبقى «عام»"} />
                  <Detail label="الموديل" value={`${result.reading.model ?? ""} · ${(result.tookMs / 1000).toFixed(1)} ثانية`} />
                </>
              )}
            </dl>
          </details>
        )}
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 border-b pb-1.5 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd dir="auto" className="break-words">{value}</dd>
    </div>
  );
}
