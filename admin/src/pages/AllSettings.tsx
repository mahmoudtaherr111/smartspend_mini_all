import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@admin/kit/button";
import { Input } from "@admin/kit/input";
import { Switch } from "@admin/kit/switch";
import { Textarea } from "@admin/kit/textarea";
import { trpc } from "@admin/lib/trpc";
import { SettingsEditor } from "../ui/SettingsEditor";
import { LoadError, Loading, PageHeader } from "../ui/states";

/** What a setting is, for the ones no other page explains. Every other setting shows its key and the page that edits it. */
export const LABELS: Record<string, { label: string; hint?: string }> = {
  usd_to_egp_rate: { label: "سعر الدولار بالجنيه", hint: "عمود الجنيه في تكلفة الذكاء الاصطناعي بيتحسب بيه." },
  parser_auto_save_threshold: { label: "يتحفظ لوحده لو متأكد قد", hint: "من 0 لـ 100. أقل من كده بيتعرض للمراجعة." },
  parser_review_threshold: { label: "يتعرض للمراجعة لو متأكد قد", hint: "من 0 لـ 100. أقل من كده بيسأل المستخدم." },
  parser_escalate_threshold: { label: "يسأل الذكاء الاصطناعي لو القواعد متأكدة أقل من", hint: "من 0 لـ 100." },
  parser_fast_decomposition_enabled: { label: "تقسيم الجملة الطويلة لعمليات", hint: "عشان «عيش ب 20 وأوبر ب 85» تبقى عمليتين." },
  parser_person_memory_enabled: { label: "ذاكرة الأشخاص", hint: "يسأل مين الشخص أول مرة، وبعدها يفتكره." },
  parser_local_verifier_enabled: { label: "المراجعة الأخيرة قبل الحفظ", hint: "تتأكد من الأرقام والفئات والتكرار من غير ذكاء اصطناعي." },
  confidence_auto_save: { label: "قديم: حد الحفظ لوحده", hint: "بيتقري بس لو «يتحفظ لوحده لو متأكد قد» مش متحفظ." },
  confidence_review: { label: "قديم: حد المراجعة", hint: "بيتقري بس لو «يتعرض للمراجعة لو متأكد قد» مش متحفظ." },
  chatbot_max_history: { label: "رسايل المحادثة اللي الشات بيفتكرها", hint: "آخر كام رسالة بتتبعت للموديل مع كل سؤال." },
  chatbot_api_key: { label: "الشات الاحتياطي: المفتاح", hint: "بيتجرب بعد موديلات الشات في «إعداد الذكاء»." },
  chatbot_base_url: { label: "الشات الاحتياطي: عنوان الخدمة" },
  chatbot_model: { label: "الشات الاحتياطي: الموديل" },
  ai_model_free: { label: "فهم الجمل الاحتياطي: موديل Gemini (المجانية)", hint: "لو مفيش موديل لتصنيف المصاريف في «إعداد الذكاء»." },
  ai_model_pro: { label: "فهم الجمل الاحتياطي: موديل Gemini (Pro)" },
  ai_model_ultra: { label: "فهم الجمل الاحتياطي: موديل Gemini (Ultra)" },
  ai_model_reports: { label: "التقارير الاحتياطي: موديل Gemini", hint: "لو مفيش موديل للتقارير في «إعداد الذكاء» ولا موديل للباقة." },
  report_provider_free: { label: "التقارير الاحتياطي: الخدمة (المجانية)", hint: "بيتستخدم بس لو مفيش موديل للتقارير في «إعداد الذكاء»." },
  report_model_free: { label: "التقارير الاحتياطي: الموديل (المجانية)" },
  report_key_slot_free: { label: "التقارير الاحتياطي: المفتاح (المجانية)" },
  report_provider_pro: { label: "التقارير الاحتياطي: الخدمة (Pro وUltra)" },
  report_model_pro: { label: "التقارير الاحتياطي: الموديل (Pro وUltra)" },
  report_key_slot_pro: { label: "التقارير الاحتياطي: المفتاح (Pro وUltra)" },
  ai_response_length: { label: "التحليل الشهري من غير أرقام جاهزة: الطول", hint: "بيتستخدم بس لما أرقام الشهر ماتجهزش." },
  ai_focus: { label: "التحليل الشهري من غير أرقام جاهزة: التركيز" },
  ai_system_prompt: { label: "التحليل الشهري من غير أرقام جاهزة: شخصية المحلل" },
  ai_advanced_instructions: { label: "التحليل الشهري من غير أرقام جاهزة: تعليمات زيادة" },
  ai_report_structure_override: { label: "التحليل الشهري من غير أرقام جاهزة: شكل التقرير" },
  stt_model: { label: "تحويل الصوت: الموديل لو الباقة مالهاش موديل" },
  stt_processing_mode: { label: "قديم: طريقة تحويل الصوت", hint: "السيرفر بيقراه ومابيغيّرش حاجة." },
  ai_memory_embedding_enabled: { label: "ذاكرة المساعد بالمعنى", hint: "لو اتقفلت، المساعد بيدوّر في الذاكرة بالكلمات بس." },
  ai_embedding_model: { label: "ذاكرة المساعد: موديل Gemini", hint: "فاضي = gemini-embedding-2. الموديلات من «إعداد الذكاء» بتسبقه." },
  ai_embedding_dimensions_short: { label: "ذاكرة المساعد: حجم المتجه القصير", hint: "ماتغيّرهوش بعد ما الذاكرة تتملي: القديم مش هيتطابق." },
  ai_embedding_dimensions_memory: { label: "ذاكرة المساعد: حجم متجه الذاكرة", hint: "ماتغيّرهوش بعد ما الذاكرة تتملي." },
  ai_embedding_dimensions_deep: { label: "ذاكرة المساعد: حجم المتجه العميق", hint: "ماتغيّرهوش بعد ما الذاكرة تتملي." },
  enable_rag: { label: "قديم (RAG): التشغيل" },
  rag_api_key: { label: "قديم (RAG): المفتاح" },
  rag_model: { label: "قديم (RAG): الموديل" },
  capture_platforms: { label: "الأنظمة اللي بتبعت رسايل البنك", hint: "android,ios" },
  capture_ai_tokens_free: { label: "توكنز قراية رسايل البنك في الشهر (المجانية)" },
  capture_financial_version: { label: "نظام الدفتر", hint: "بيتحط لوحده لما تحويل الدفتر للدخل والصرف يخلص. مايتغيرش من هنا." },
};

/** Settings that take one of a few values: offered as a choice, so a typo cannot reach the server. */
const PROVIDERS: [string, string][] = [["gemini", "Gemini"], ["groq", "Groq"], ["fireworks", "Fireworks"], ["nvidia", "NVIDIA"]];
const SLOTS: [string, string][] = [["key1", "المفتاح الأساسي"], ["key2", "المفتاح التاني"]];
export const CHOICES: Record<string, [string, string][]> = {
  ai_response_length: [["short", "قصير"], ["medium", "متوسط"], ["detailed", "مفصّل"]],
  ai_focus: [["balanced", "متوازن"], ["statistics", "أرقام"], ["tips", "نصايح"], ["patterns", "أنماط الصرف"]],
  report_provider_free: PROVIDERS,
  report_provider_pro: PROVIDERS,
  report_key_slot_free: SLOTS,
  report_key_slot_pro: SLOTS,
  free_stt_provider: [["gemini", "Gemini"], ["groq", "Groq (Whisper)"]],
  pro_stt_provider: [["gemini", "Gemini"], ["groq", "Groq (Whisper)"]],
  free_stt_key_slot: SLOTS,
  pro_stt_key_slot: SLOTS,
};

/** Settings the server sets itself: shown, never edited. */
export const READ_ONLY = new Set(["capture_financial_version"]);

const GROUPS: { id: string; label: string; page?: { to: string; name: string }; test: (key: string) => boolean }[] = [
  { id: "plans", label: "الباقات والحدود", page: { to: "/plans", name: "الباقات والحدود" }, test: (k) => /^feature_|_(free|pro|ultra)$/.test(k) && !/^(voice_|capture_|report_(provider|model|key_slot)_|ai_model_|stt_)/.test(k) && !/_stt_/.test(k) },
  { id: "voice", label: "المكالمة الصوتية", page: { to: "/plans", name: "الباقات والحدود ← المكالمة" }, test: (k) => /^voice_(?!limit_|per_req_)/.test(k) },
  { id: "capture", label: "رسايل البنوك", page: { to: "/bank-messages", name: "رسايل البنوك" }, test: (k) => /^(capture_|sms_)/.test(k) },
  { id: "parser", label: "فهم الجمل", page: { to: "/ai/classifications", name: "التصنيف وسببه" }, test: (k) => /^(parser_|confidence_)/.test(k) },
  { id: "ai", label: "الذكاء الاصطناعي", page: { to: "/ai/setup", name: "إعداد الذكاء" }, test: (k) => /^(ai_|chatbot_|rag_|enable_rag|stt_|report_(provider|model|key_slot)_)|_stt_|_api_key/.test(k) },
  { id: "whatsapp", label: "واتساب", page: { to: "/communications", name: "التواصل والإعلانات" }, test: (k) => /^whatsapp_/.test(k) },
  { id: "operations", label: "التشغيل", page: { to: "/operations", name: "التشغيل" }, test: () => true },
];

const groupOf = (key: string) => GROUPS.find((group) => group.test(key))!;

type Entry = { key: string; secret: boolean; default: string; hasDefault: boolean };

function Editor({ entry, value, onChange }: { entry: Entry; value: string; onChange: (value: string) => void }) {
  const label = LABELS[entry.key]?.label ?? entry.key;
  if (READ_ONLY.has(entry.key)) return <code className="text-sm" dir="ltr">{value || "—"}</code>;
  const choices = CHOICES[entry.key];
  if (choices) {
    return (
      <select aria-label={label} className="h-9 rounded-md border bg-background px-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {!choices.some(([id]) => id === value) && <option value={value}>{value || "—"}</option>}
        {choices.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
      </select>
    );
  }
  if (entry.secret) return <Input aria-label={label} dir="ltr" type="password" autoComplete="off" className="max-w-sm" value={value} onChange={(e) => onChange(e.target.value.trim())} />;
  if (entry.default === "true" || entry.default === "false") {
    return <Switch aria-label={label} checked={value === "true"} onCheckedChange={(on) => onChange(String(on))} />;
  }
  if (entry.default.length > 60 || /prompt|instructions|override/.test(entry.key)) {
    return <Textarea aria-label={label} rows={3} className="max-w-xl" value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  const numeric = /^\d+(\.\d+)?$/.test(entry.default);
  return <Input aria-label={label} dir="ltr" inputMode={numeric ? "decimal" : undefined} className={numeric ? "w-36" : "max-w-sm"} value={value} onChange={(e) => onChange(e.target.value)} />;
}

/** Every setting the server reads, in one place: the pages edit them in words, this edits any of them directly. */
export function AllSettings() {
  const catalog = trpc.adminConsole.settingsCatalog.useQuery();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [changedOnly, setChangedOnly] = useState(false);
  const entries = useMemo(() => catalog.data ?? [], [catalog.data]);

  if (catalog.isLoading) return <Loading />;
  if (!catalog.data) return <LoadError message="ماقدرناش نجيب الإعدادات." onRetry={() => catalog.refetch()} />;

  return (
    <div>
      <PageHeader title="كل الإعدادات" description={`كل إعداد السيرفر بيقراه (${entries.length})، في مكان واحد. أغلبها ليه صفحة بتشرحه؛ هنا بتقدر تعدّل أي واحد مباشرةً. التغيير بيوصل لكل السيرفرات خلال دقايق.`} />
      <SettingsEditor>
        {({ formData, updateField }) => {
          const q = search.trim().toLowerCase();
          const rows = entries.filter((entry) => {
            if (group !== "all" && groupOf(entry.key).id !== group) return false;
            if (changedOnly && !entry.secret && (formData[entry.key] ?? "") === entry.default) return false;
            if (changedOnly && entry.secret && !formData[entry.key]) return false;
            const label = LABELS[entry.key]?.label ?? "";
            return !q || entry.key.toLowerCase().includes(q) || label.includes(search.trim());
          });
          return (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Input className="max-w-xs" placeholder="دوّر باسم الإعداد أو معناه" value={search} onChange={(e) => setSearch(e.target.value)} />
                <select aria-label="المجموعة" className="h-9 rounded-md border bg-background px-2 text-sm" value={group} onChange={(e) => setGroup(e.target.value)}>
                  <option value="all">كل المجموعات</option>
                  {GROUPS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
                <label className="flex items-center gap-2 text-sm"><Switch checked={changedOnly} onCheckedChange={setChangedOnly} aria-label="اللي اتغيّر بس" />اللي اتغيّر عن الافتراضي بس</label>
                <span className="text-sm text-muted-foreground">{rows.length} إعداد</span>
              </div>
              <ul className="divide-y rounded-xl border">
                {rows.map((entry) => {
                  const meta = LABELS[entry.key];
                  const home = groupOf(entry.key);
                  const value = formData[entry.key] ?? "";
                  const changed = !entry.secret && !READ_ONLY.has(entry.key) && value !== entry.default;
                  return (
                    <li key={entry.key} className="grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                      <div className="min-w-0">
                        <div className="font-semibold">{meta?.label ?? <span dir="ltr">{entry.key}</span>}{changed && <span className="ms-2 text-xs font-normal text-amber-700 dark:text-amber-400">اتغيّر</span>}</div>
                        {meta && <div className="text-xs text-muted-foreground" dir="ltr">{entry.key}</div>}
                        {meta?.hint && <div className="text-xs text-muted-foreground">{meta.hint}</div>}
                        {home.page && !meta && <div className="text-xs text-muted-foreground">بيتعدل بالشرح من <Link className="underline" to={home.page.to}>{home.page.name}</Link></div>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Editor entry={entry} value={value} onChange={(next) => updateField(entry.key, next)} />
                        {!entry.secret && !READ_ONLY.has(entry.key) && changed && (
                          <Button size="sm" variant="ghost" onClick={() => updateField(entry.key, entry.default)}>رجّعه للافتراضي{entry.default ? ` (${entry.default.length > 20 ? `${entry.default.slice(0, 20)}…` : entry.default})` : ""}</Button>
                        )}
                        {entry.secret && <span className="text-xs text-muted-foreground">{value ? "متحفظ؛ اكتب الجديد مكانه عشان تغيّره" : entry.hasDefault ? "من إعدادات السيرفر" : "مش متحدد"}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          );
        }}
      </SettingsEditor>
    </div>
  );
}
