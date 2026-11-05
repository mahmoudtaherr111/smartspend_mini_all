import { CheckCircle2, CircleAlert, XCircle } from "lucide-react";
import { Button } from "@admin/kit/button";
import { trpc } from "@admin/lib/trpc";
import type { RouterOutputs } from "@admin/lib/trpc";
import { LoadError, Loading, PageHeader } from "../ui/states";
import { dayTime } from "../ui/words";

type Check = RouterOutputs["adminConsole"]["status"]["checks"][number];
type Facts = Check["facts"];

const list = (value: Facts[string]) => (Array.isArray(value) ? value.join("، ") : String(value ?? ""));

/** Each check in words: what it is, and what its state means for the app and what to do. */
const WORDS: Record<string, { title: string; say: (state: Check["state"], facts: Facts) => string }> = {
  database: { title: "قاعدة البيانات", say: (state, f) => (state === "ok" ? `شغالة، ردت في ${f.latencyMs} مللي.` : "مش بترد: التطبيق كله واقف.") },
  migrations: {
    title: "تحديثات قاعدة البيانات",
    say: (state, f) =>
      state === "ok" ? `كلها متطبقة، وآخرها ${f.latest}.`
        : f.journal === false ? "قاعدة البيانات مفيهاش سجل التحديثات. شغّل npm run db:doctor واتبع اللي بيقوله."
        : `فيه ${(f.pending as string[]).length} تحديث لسه ماتطبقش (${list(f.pending)}): الحاجات اللي محتاجاه مش هتشتغل. شغّل npm run db:migrate من نسخة الكود دي.`,
  },
  redis: {
    title: "Redis (الكاش والحدود المشتركة)",
    say: (state, f) =>
      f.connected ? `شغال، والكاش بيصيب ${f.hitRatePercent}%.`
        : f.configured ? "متحدد بس مش متوصل: الحدود والكاش بيتحسبوا لكل سيرفر لوحده لحد ما يرجع."
        : state === "warn" ? "مش متحدد: لو فيه أكتر من سيرفر، كل واحد بيحسب الحدود لوحده. حط REDIS_URL." : "مش متحدد، والتشغيل ده بيستخدم الذاكرة.",
  },
  jobs: {
    title: "المهام في الخلفية",
    say: (state, f) =>
      state === "ok" ? `شغالة، وآخر مهمة اشتغلت ${dayTime(String(f.lastRunAt))}.`
        : `مفيش مهمة اشتغلت آخر 10 دقايق: رسايل البنك والإشعارات والتقارير واقفة. لازم سيرفر واحد شغال بـ ENABLE_CRONS=true${f.thisProcessRunsThem ? " (السيرفر ده متحدد كده، فشوف سجله)" : ""}.`,
  },
  push: { title: "إشعارات الموبايل (Firebase)", say: (state) => (state === "ok" ? "شغالة." : "Firebase مش متحدد: مفيش ولا إشعار بيوصل لأي موبايل. حط FIREBASE_PROJECT_ID، FIREBASE_CLIENT_EMAIL، FIREBASE_PRIVATE_KEY.") },
  whatsapp: { title: "واتساب", say: (state) => (state === "ok" ? "متوصّل." : "مش متوصّل: كود التحقق والتقرير الشهري على واتساب مش بيتبعتوا.") },
  storage: {
    title: "تخزين الملفات",
    say: (state, f) => (f.objectStorage ? "الملفات في تخزين خارجي (S3 أو R2)." : state === "fail" ? "صور الفواتير بتتحفظ على ديسك السيرفر وبتضيع مع أي نشر جديد. حط R2_BUCKET_NAME، R2_ENDPOINT." : "على ديسك الجهاز (تشغيل محلي)."),
  },
  errors: { title: "متابعة الأخطاء (Sentry)", say: (state) => (state === "ok" ? "شغالة." : "مش متحددة: لو حصل خطأ عند مستخدم مش هنعرف. حط SENTRY_DSN.") },
  bots: { title: "الحماية من البوتات", say: (state, f) => (f.turnstile ? "Turnstile شغال في التسجيل وطلب الأكواد." : state === "warn" ? "مش شغالة: أي حد يقدر يطلب أكواد تحقق بالجملة. حط TURNSTILE_SECRET_KEY." : "مقفولة في التشغيل المحلي.") },
  secrets: {
    title: "أسرار السيرفر",
    say: (state, f) => (state === "ok" ? "كلها متحددة." : `ناقص ${list(f.missing)}. من غير AI_GATEWAY_SECRET، مفاتيح الموصلات متشفّرة بـ JWT_SECRET، ولو اتغيّر بتضيع كلها.`),
  },
  ai: {
    title: "الذكاء الاصطناعي",
    say: (state, f) =>
      state === "fail" ? "مفيش ولا موصل ولا مفتاح Gemini على السيرفر: كل حاجة بالذكاء واقفة."
        : [Number(f.connectors) === 0 ? "مفيش موصلات: كل حاجة بيرد عليها مفتاح Gemini اللي على السيرفر." : `${f.connectors} موصل شغال${f.serverKey ? "، ومفتاح Gemini احتياطي على السيرفر" : "، ومفيش مفتاح احتياطي على السيرفر"}.`,
          (f.unreadable as string[]).length ? `مفاتيح مش مقروءة: ${list(f.unreadable)}.` : "",
          (f.down as string[]).length ? `واقع عند آخر فحص: ${list(f.down)}.` : ""].filter(Boolean).join(" "),
  },
  admins: { title: "الأدمنز", say: (state, f) => (state === "ok" ? `${f.admins} أدمن.` : "أدمن واحد بس: لو فقد حسابه محدش هيدخل اللوحة. خلّي حد تاني أدمن من «الناس».") },
};

const ICON = {
  ok: <CheckCircle2 className="size-5 text-emerald-600" aria-label="شغال" />,
  warn: <CircleAlert className="size-5 text-amber-600" aria-label="محتاج انتباه" />,
  fail: <XCircle className="size-5 text-red-600" aria-label="واقف" />,
};

/** Whether this server is ready to serve, check by check, refreshed every minute. */
export function Status() {
  const status = trpc.adminConsole.status.useQuery(undefined, { refetchInterval: 60_000 });
  if (status.isLoading) return <Loading />;
  if (!status.data) return <LoadError message="ماقدرناش نسأل السيرفر." onRetry={() => status.refetch()} />;
  const order = { fail: 0, warn: 1, ok: 2 } as const;
  const checks = [...status.data.checks].sort((a, b) => order[a.state] - order[b.state]);
  const fails = checks.filter((check) => check.state === "fail").length;
  const warns = checks.filter((check) => check.state === "warn").length;
  const p = status.data.process;

  return (
    <div>
      <PageHeader title="حالة السيرفر" description="كل حاجة السيرفر محتاجها عشان يشتغل صح، من اللي السيرفر عارفه عن نفسه. بتتحدث كل دقيقة."
        actions={<Button variant="outline" onClick={() => status.refetch()} disabled={status.isFetching}>{status.isFetching ? "بيفحص…" : "افحص دلوقتي"}</Button>} />
      <div className={`mb-4 rounded-xl border p-4 font-semibold ${fails ? "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" : warns ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300" : "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"}`}>
        {fails ? `فيه ${fails} حاجة واقفة${warns ? ` و${warns} محتاجة انتباه` : ""}.` : warns ? `السيرفر شغال، وفيه ${warns} حاجة محتاجة انتباه قبل ما الناس تكتر.` : "السيرفر جاهز: كل حاجة شغالة."}
      </div>
      <ul className="divide-y rounded-xl border">
        {checks.map((check) => {
          const words = WORDS[check.id];
          return (
            <li key={check.id} className="flex items-start gap-3 p-4">
              <span className="mt-0.5 shrink-0">{ICON[check.state]}</span>
              <div className="min-w-0">
                <div className="font-semibold">{words?.title ?? check.id}</div>
                <div className="text-sm text-muted-foreground">{words ? words.say(check.state, check.facts) : JSON.stringify(check.facts)}</div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-muted-foreground" dir="auto">
        السيرفر اللي رد: {String(p.host)} · {p.environment === "production" ? "إنتاج" : p.environment === "development" ? "تطوير" : String(p.environment)} · شغال من {p.uptimeMinutes} دقيقة · {p.memoryMb} ميجا ذاكرة · Node {String(p.node)} · التوقيت {String(p.timezone)} · الموقع {p.website === "on" ? "شغال" : "مركون"}
      </p>
    </div>
  );
}
