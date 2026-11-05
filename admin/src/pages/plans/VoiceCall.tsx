import { useState } from "react";
import { GEMINI_TEXT_MODELS, VOICE_LIVE_MODELS, VOICE_THINKING_LEVELS } from "@contracts/voice-models";
import { Button } from "@admin/kit/button";
import { Input } from "@admin/kit/input";
import { Switch } from "@admin/kit/switch";
import { trpc } from "@admin/lib/trpc";
import { LoadError, Loading } from "../../ui/states";
import { usd } from "../../ui/words";
import { PlanMatrix, type Props, type Row } from "./PlanMatrix";

const LIVE: [string, string][] = VOICE_LIVE_MODELS.map((model) => [model.id, model.label]);
const LEVELS: [string, string][] = VOICE_THINKING_LEVELS.map((level) => [level, { low: "قليل (أسرع)", medium: "متوسط", high: "كتير (أبطأ)" }[level]]);
const TEXT: [string, string][] = GEMINI_TEXT_MODELS.map((model) => [model.id, model.label]);

const PER_PLAN: Row[] = [
  { kind: "switch", label: "المكالمة متاحة", key: (plan) => `voice_call_enabled_${plan}`, fallback: { free: true, pro: true, ultra: true } },
  { kind: "number", label: "دقايق في الشهر", hint: "بتتعد بشهر القاهرة وبترجع أوله.", key: (plan) => `voice_call_limit_${plan}`, unit: "دقيقة" },
  { kind: "number", label: "أطول مكالمة", key: (plan) => `voice_call_duration_${plan}`, unit: "ثانية" },
  { kind: "number", label: "سقف تكلفة اليوم لكل مستخدم", hint: "بعده المكالمة بتقفل لحد بكره.", key: (plan) => `voice_daily_cost_cap_usd_${plan}`, unit: "$", decimal: true },
  { kind: "switch", label: "«تفكير أعمق» متاح", hint: "المستخدم يختار موديل بيفكر في الخلفية، وتكلفته أعلى.", key: (plan) => `voice_ultra_enabled_${plan}`, fallback: { free: false, pro: false, ultra: false } },
  { kind: "select", label: "موديل المكالمة", key: (plan) => `voice_v2_model_${plan}`, options: [["", "زي الإعداد العام"], ...LIVE] },
];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-semibold">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return (
    <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
    </select>
  );
}

function NumberInput({ value, onChange, decimal }: { value: string; onChange: (value: string) => void; decimal?: boolean }) {
  return <Input dir="ltr" inputMode="decimal" className="w-32" value={value} onChange={(e) => onChange(e.target.value.replace(decimal ? /[^\d.]/g : /[^\d]/g, ""))} />;
}

/** The last days of calls, from the calls' own records: no word said in a call is stored or shown. */
function VoiceNumbers() {
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const stats = trpc.voice.adminStats.useQuery({ days });
  return (
    <section className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">المكالمات</h2>
        <div className="flex gap-1">
          {([1, 7, 30] as const).map((value) => (
            <Button key={value} size="sm" variant={days === value ? "default" : "outline"} onClick={() => setDays(value)}>{value === 1 ? "النهارده" : `${value} يوم`}</Button>
          ))}
        </div>
      </div>
      {stats.isLoading ? <Loading /> : !stats.data ? <LoadError message="ماقدرناش نجيب أرقام المكالمات." onRetry={() => stats.refetch()} /> : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["مكالمات", stats.data.calls.toLocaleString("ar-EG")],
              ["ناس اتكلموا", stats.data.callers.toLocaleString("ar-EG")],
              ["دقايق", stats.data.minutes.toLocaleString("ar-EG")],
              ["متوسط المكالمة", `${Math.round(stats.data.averageCallSeconds)} ث`],
              ["التكلفة", usd(stats.data.costUsd)],
              ["تكلفة الدقيقة", stats.data.costPerMinuteUsd === null ? "—" : usd(stats.data.costPerMinuteUsd)],
              ["أول صوت بعد ما المستخدم يسكت", stats.data.firstAudioMs.p50 === null ? "—" : `${stats.data.firstAudioMs.p50} مللي (95%: ${stats.data.firstAudioMs.p95 ?? "—"})`],
              ["إعادة اتصال لكل مكالمة", stats.data.reconnectsPerCall.toFixed(2)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-muted/40 p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-lg font-bold">{value}</dd>
              </div>
            ))}
          </dl>
          {stats.data.models.length > 0 && (
            <table className="mt-3 w-full text-sm">
              <thead><tr className="border-b text-start"><th className="p-2 text-start">الموديل</th><th className="p-2 text-start">مكالمات</th><th className="p-2 text-start">دقايق</th><th className="p-2 text-start">التكلفة</th></tr></thead>
              <tbody className="divide-y">
                {stats.data.models.map((model) => (
                  <tr key={model.key}><td className="p-2" dir="ltr">{model.key}</td><td className="p-2">{model.count}</td><td className="p-2">{model.minutes}</td><td className="p-2">{usd(model.costUsd)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

/** The live call: who may call and for how long, which models, the coach, and how many calls the server takes. */
export function VoiceCall({ formData, updateField }: Props) {
  const value = (key: string) => formData[key] ?? "";
  const stopped = formData.voice_v2_kill_switch === "true";
  return (
    <div className="space-y-4">
      <section className={`flex items-center justify-between gap-4 rounded-xl border p-4 ${stopped ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30" : ""}`}>
        <div>
          <h2 className="font-bold">{stopped ? "المكالمات واقفة لكل الناس" : "المكالمات شغالة"}</h2>
          <p className="text-sm text-muted-foreground">لو حصلت مشكلة، اقفلها هنا وكل المكالمات الجديدة بتترفض لحد ما تفتحها.</p>
        </div>
        <Switch checked={!stopped} aria-label="المكالمات شغالة" onCheckedChange={(on) => updateField("voice_v2_kill_switch", String(!on))} />
      </section>

      <PlanMatrix formData={formData} updateField={updateField} title="لكل باقة" rows={PER_PLAN} />

      <section className="grid gap-4 rounded-xl border p-4 md:grid-cols-2">
        <h2 className="font-bold md:col-span-2">الموديلات</h2>
        <Field label="موديل المكالمة العام"><Select value={value("voice_v2_model")} onChange={(v) => updateField("voice_v2_model", v)} options={LIVE} /></Field>
        <Field label="تفكير موديل المكالمة"><Select value={value("voice_v2_thinking_level")} onChange={(v) => updateField("voice_v2_thinking_level", v)} options={LEVELS} /></Field>
        <Field label="أداة التفكير جوه المكالمة" hint="لما المستخدم يسأل سؤال محتاج حساب. موديل Gemini، أو اسم موديل متضاف في «إعداد الذكاء» (زي Claude).">
          <Input dir="ltr" list="voice-think-models" value={value("voice_think_model")} onChange={(e) => updateField("voice_think_model", e.target.value.trim())} />
          <datalist id="voice-think-models">{GEMINI_TEXT_MODELS.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</datalist>
        </Field>
        <Field label="أداة الأسعار" hint="بتدوّر على سعر حاجة في السوق بجوجل، فلازم Gemini."><Select value={value("voice_price_model")} onChange={(v) => updateField("voice_price_model", v)} options={TEXT} /></Field>
        <Field label="ملخص ما بعد المكالمة" hint="اللي المساعد بيفتكره من المكالمة."><Select value={value("voice_memory_model")} onChange={(v) => updateField("voice_memory_model", v)} options={TEXT} /></Field>
      </section>

      <section className="grid gap-4 rounded-xl border p-4 md:grid-cols-2">
        <h2 className="font-bold md:col-span-2">سمارت المدرب</h2>
        <Field label="نسبة المستخدمين اللي بيشوفوه" hint="0 = مقفول، 100 = لكل الناس."><NumberInput value={value("voice_coach_rollout_percent")} onChange={(v) => updateField("voice_coach_rollout_percent", String(Math.min(100, Number(v || 0))))} /></Field>
        <Field label="حسابات التجربة" hint="بيشوفوه دايماً، مهما كانت النسبة. زي local:12, oauth:7">
          <Input dir="ltr" value={value("voice_coach_allowlist")} onChange={(e) => updateField("voice_coach_allowlist", e.target.value)} />
        </Field>
        <Field label="موديل المدرب"><Select value={value("voice_coach_model")} onChange={(v) => updateField("voice_coach_model", v)} options={LIVE} /></Field>
        <Field label="تفكير المدرب"><Select value={value("voice_coach_thinking_level")} onChange={(v) => updateField("voice_coach_thinking_level", v)} options={LEVELS} /></Field>
      </section>

      <section className="grid gap-4 rounded-xl border p-4 md:grid-cols-3">
        <h2 className="font-bold md:col-span-3">السعة</h2>
        <Field label="مكالمات في نفس الوقت"><NumberInput value={value("voice_max_concurrent_calls")} onChange={(v) => updateField("voice_max_concurrent_calls", v)} /></Field>
        <Field label="مكالمات «تفكير أعمق» في نفس الوقت"><NumberInput value={value("voice_ultra_max_concurrent_calls")} onChange={(v) => updateField("voice_ultra_max_concurrent_calls", v)} /></Field>
        <Field label="مكالمات للمستخدم الواحد في نفس الوقت"><NumberInput value={value("voice_max_calls_per_user")} onChange={(v) => updateField("voice_max_calls_per_user", v)} /></Field>
        <Field label="توكنز الدقيقة (العادي)" hint="حد Google للموديل في الدقيقة."><NumberInput value={value("voice_standard_input_tpm")} onChange={(v) => updateField("voice_standard_input_tpm", v)} /></Field>
        <Field label="محجوز لكل مكالمة (العادي)"><NumberInput value={value("voice_standard_reserved_tpm")} onChange={(v) => updateField("voice_standard_reserved_tpm", v)} /></Field>
        <div className="hidden md:block" />
        <Field label="توكنز الدقيقة («تفكير أعمق»)"><NumberInput value={value("voice_ultra_input_tpm")} onChange={(v) => updateField("voice_ultra_input_tpm", v)} /></Field>
        <Field label="محجوز لكل مكالمة («تفكير أعمق»)"><NumberInput value={value("voice_ultra_reserved_tpm")} onChange={(v) => updateField("voice_ultra_reserved_tpm", v)} /></Field>
      </section>

      <VoiceNumbers />
    </div>
  );
}
