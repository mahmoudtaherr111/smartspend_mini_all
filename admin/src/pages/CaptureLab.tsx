import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "../ui/states";

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
  { label: "مرفوضة", sender: "AAIB", text: "AAIB: Transaction declined. EGP 4,500.00 at B.TECH NASR CITY, card **5512. Reason: insufficient balance." },
  { label: "كود تحقق", sender: "CIB", text: "Your one-time password for the online purchase of EGP 799.00 at JUMIA is 482913. Never share it." },
  { label: "عرض", sender: "NBE", text: "استمتع بخصم 20% على مشترياتك ببطاقات الأهلي حتى 30/11" },
];

const ADMISSION: Record<string, string> = {
  personal_sender: "اتجاهلت: جاية من رقم موبايل شخص",
  no_keyword: "اتجاهلت: مفيهاش ولا كلمة من كلمات الفلوس، فالموبايل ماكانش هيبعتها",
  otp: "اترمت: كود تحقق، مابيتحفظش ومابيروحش للذكاء الاصطناعي",
  user_ignored: "اتجاهلت: كارت أو جملة إنت قلت نتجاهلها",
  redaction_failed: "اترفضت: ماقدرناش نخبّي البيانات فيها",
  unknown_app: "اترفضت: التطبيق ده مش في قايمة البنوك",
};
const OUTCOME: Record<string, string> = {
  recorded: "اتسجلت لوحدها",
  review: "مستنية تأكيدك في التطبيق",
  merged: "اتضمت لعملية اتسجلت قبل كده (نفس العملية من مصدر تاني)",
  held: "اتعلقت: وصلت لحد الباقة في الشهر",
  not_transaction: "مفيش تسجيل: مش عملية فلوس (عرض، رصيد، كشف حساب)",
  declined: "مفيش تسجيل: العملية اترفضت",
  on_hold: "مفيش تسجيل: مبلغ محجوز لسه ماتخصمش",
  failed: "الذكاء الاصطناعي مش بيرد دلوقتي، والرسالة مستنية وهتتقري أول ما يرجع",
  invalid_reply: "الرد ماعداش الفحص، وهنجرب تاني",
  financial_upgrade: "مستنية تحويل الدفتر لنظام الدخل والصرف",
  disabled: "تسجيل رسايل البنك مقفول من الإعدادات",
};
const KIND: Record<string, string> = {
  purchase: "شراء", bill: "فاتورة", topup: "شحن رصيد", transfer: "تحويل", cash_withdrawal: "سحب نقدي", cash_deposit: "إيداع نقدي",
  refund: "مرتجع", reversal: "إلغاء عملية", salary: "مرتب", fee: "رسوم", interest: "فوايد", cashback: "كاش باك", card_payment: "سداد كارت",
  installment: "قسط", loan: "سلفة", other: "تاني",
};
const STATUS: Record<string, string> = { completed: "تمت", declined: "اترفضت", pending: "محجوزة", not_transaction: "مش عملية" };

/** Where the web app is: the same origin in production; beside the console's dev server in development. */
function appUrl(): string {
  return window.location.port === "3100" ? `${window.location.protocol}//${window.location.hostname}:3010/` : "/";
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium" dir="auto">{value}</span>
    </div>
  );
}

/**
 * «تجربة الرسايل»: type or pick a bank message, send it as a phone would, and see what the server kept, what the
 * model read, and the row in your own ledger, which the app then shows like any user's.
 */
export function CaptureLab() {
  const [text, setText] = useState("");
  const [sender, setSender] = useState("");
  const [channel, setChannel] = useState<"sms" | "notification">("sms");
  const [app, setApp] = useState("com.egyptianbanks.instapay");
  const simulate = trpc.captureAdmin.simulate.useMutation({ onError: (error) => toast.error(error.message) });
  const result = simulate.data;
  const facts = result?.reading?.facts;
  const posting = result?.reading?.posting as { status: string; principalEgp?: string; feeEgp?: string; totalEgp?: string; reason?: string } | null | undefined;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="تجربة رسايل البنك"
        description="اكتب رسالة زي ما البنك أو المحفظة بيبعتها، أو اختار مثال. بتعدّي على نفس الطريق اللي رسالة الموبايل بتعدّي عليه، وبتتسجل في دفترك إنت، وتقدر تشوفها في التطبيق زي أي مستخدم."
      />
      <div className="mb-3 flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <Button key={example.label} size="sm" variant="outline" onClick={() => { setText(example.text); setSender(example.sender); setChannel("sms"); }}>
            {example.label}
          </Button>
        ))}
      </div>
      <div className="space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={channel === "sms" ? "default" : "outline"} onClick={() => setChannel("sms")}>رسالة SMS</Button>
          <Button size="sm" variant={channel === "notification" ? "default" : "outline"} onClick={() => setChannel("notification")}>إشعار تطبيق</Button>
        </div>
        {channel === "sms" ? (
          <Input aria-label="الراسل" placeholder="الراسل، زي CIB أو VF-Cash" value={sender} onChange={(e) => setSender(e.target.value)} dir="ltr" />
        ) : (
          <Input aria-label="التطبيق" placeholder="com.egyptianbanks.instapay" value={app} onChange={(e) => setApp(e.target.value)} dir="ltr" />
        )}
        <Textarea aria-label="نص الرسالة" rows={4} placeholder="نص الرسالة" value={text} onChange={(e) => setText(e.target.value)} dir="auto" />
        <Button className="w-full" disabled={simulate.isPending || text.trim().length < 3}
          onClick={() => simulate.mutate({ text, sender: channel === "sms" ? sender : null, channel, app: channel === "notification" ? app : null })}>
          {simulate.isPending ? "بنقرا الرسالة…" : "ابعت الرسالة"}
        </Button>
      </div>

      {result && (
        <div className="mt-4 space-y-3">
          <section className="rounded-xl border p-4">
            <h2 className="mb-2 font-semibold">1. السيرفر استلمها</h2>
            <p className="text-sm">{result.admission.result === "queued" ? "اتقبلت ورايحة للذكاء الاصطناعي" : ADMISSION[result.admission.reason ?? ""] ?? `${result.admission.result} ${result.admission.reason ?? ""}`}</p>
            {result.redacted && <p className="mt-2 rounded-md bg-muted p-2 text-xs" dir="auto">اللي اتبعت بعد ما الأرقام اتخبّت: {result.redacted}</p>}
          </section>

          {facts && (
            <section className="rounded-xl border p-4">
              <h2 className="mb-2 font-semibold">2. الذكاء الاصطناعي فهم إيه</h2>
              <Row label="الحالة" value={STATUS[facts.status] ?? facts.status} />
              <Row label="النوع" value={KIND[facts.kind] ?? facts.kind} />
              <Row label="الاتجاه" value={facts.flow === "out" ? "خارجة من فلوسك" : facts.flow === "in" ? "داخلة لفلوسك" : "مش معروف"} />
              {facts.amount && <Row label="المبلغ" value={`${facts.amount.value} ${facts.amount.currency}`} />}
              {facts.egp && <Row label="بالجنيه" value={facts.egp.value} />}
              {facts.fee && <Row label="الرسوم" value={`${facts.fee.value} (${facts.fee.included ? "جوه المبلغ" : "زيادة على المبلغ"})`} />}
              {facts.balance && <Row label="الرصيد بعدها" value={facts.balance.value} />}
              <Row label="الطرف التاني" value={facts.party ?? "—"} />
              <Row label="الفئة اللي اقترحها" value={facts.category ? `${facts.category} / ${facts.subcategory ?? "عام"}` : "مش عارف"} />
              {facts.ownMove && <Row label="ملاحظة" value="فلوسك بتتنقل بين جيوبك، مش بتدخل في الصرف والدخل" />}
              <p className="mt-2 text-xs text-muted-foreground">الموديل: {result.reading?.model} · {result.tookMs} مللي ثانية</p>
            </section>
          )}

          <section className="rounded-xl border p-4">
            <h2 className="mb-2 font-semibold">3. النتيجة</h2>
            {result.job && <p className="text-sm">{OUTCOME[result.job.outcome ?? ""] ?? result.job.outcome ?? "لسه بتتقري"}</p>}
            {posting?.status === "waiting" && <p className="text-sm text-amber-700">ناقصها حاجة ({posting.reason})، فهتلاقيها في التطبيق مستنية تكمّلها.</p>}
            {result.event?.possibleDuplicate && <p className="text-sm text-amber-700">ممكن تكون نفس عملية قبلها، فبتستنى تأكيدك.</p>}
            {result.ledger && (
              <div className="mt-3 rounded-lg bg-muted p-3">
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant={result.ledger.type === "income" ? "default" : "secondary"}>{result.ledger.type === "income" ? "دخل" : "صرف"}</Badge>
                  {result.ledger.excludedFromTotals && <Badge variant="outline">مش في الإجمالي</Badge>}
                </div>
                <Row label="اللي هيظهر في الدفتر" value={result.ledger.description} />
                <Row label="الفئة" value={`${result.ledger.category} / ${result.ledger.subCategory}`} />
                <Row label="المبلغ" value={`${result.ledger.amount} ج.م`} />
                {result.ledger.feeAmount && <Row label="الرسوم (سطر مربوط)" value={`${result.ledger.feeAmount} ج.م`} />}
              </div>
            )}
            {result.job?.notice && (
              <p className="mt-3 rounded-md border p-2 text-xs" dir="auto">
                الإشعار اللي كان هيظهر على الموبايل: <b>{(result.job.notice as { title?: string }).title}</b> — {(result.job.notice as { body?: string }).body}
              </p>
            )}
            <a className="mt-3 inline-block text-sm font-medium text-primary underline" href={appUrl()} target="_blank" rel="noreferrer">
              افتح التطبيق وشوفها في دفترك
            </a>
          </section>
        </div>
      )}
    </div>
  );
}
