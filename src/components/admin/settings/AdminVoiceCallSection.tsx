/**
 * The voice call in the admin console: the kill switch, which models it uses per plan, the daily cost cap, and a dashboard of the calls made (counts, minutes, cost, speed, why calls ended and
 * what went wrong). Settings are saved with the rest of the settings form; the dashboard reads `voice.adminStats`,
 * which never returns what was said.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Activity, PhoneCall } from "lucide-react";
import { trpc } from "@/providers/trpc";
import {
  GEMINI_TEXT_MODELS,
  VOICE_LIVE_MODELS,
  VOICE_THINKING_LEVELS,
} from "@contracts/voice-models";
import { FieldLabel, SectionHeader } from "./AdminSettingsShared";

const PLANS = [
  { key: "free", label: "المجانية" },
  { key: "pro", label: "برو" },
  { key: "ultra", label: "ألترا" },
] as const;

/** Radix Select cannot hold an empty value; this stands for "use the default". */
const SAME_AS_DEFAULT = "__default";

const TEXT_MODEL_SETTINGS = [
  {
    key: "voice_think_model",
    fallback: "gemini-3.5-flash-lite",
    label: "موديل التفكير (think)",
    hint: "بيحسب الخطط والـ«لو» و«أقدر أشتري؟» والمستخدم مستني على الخط: خليه سريع. لو اتأخر ٥ ثواني بيروح للي بعده.",
  },
  {
    key: "voice_price_model",
    fallback: "gemini-3.5-flash-lite",
    label: "موديل الأسعار (market_price)",
    hint: "بيدوّر على سعر الدهب والعملات في جوجل. السعر بيتحفظ ٣٠ دقيقة للكل.",
  },
  {
    key: "voice_memory_model",
    fallback: "gemini-3.8-flash",
    label: "موديل ملخص ما بعد المكالمة",
    hint: "بيكتب ملخص المكالمة والحاجات اللي تتفتكر بعد ما تقفل؛ مفيش حد مستني، فالأقوى مناسب.",
  },
] as const;

const END_REASONS: Record<string, string> = {
  user: "المستخدم قفل",
  time_limit: "الوقت خلص",
  daily_cost_cap: "سقف التكلفة",
  inactive: "سكوت طويل",
  network: "النت قطع ومارجعش",
  provider: "مشكلة عند جوجل",
  server: "السيرفر وقف في النص",
  unknown: "غير معروف",
};

interface Props {
  formData: Record<string, string>;
  updateField: (key: string, value: string) => void;
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-white dark:bg-slate-950/40 p-3 min-w-0">
      <div className="text-[11px] text-slate-500 truncate" title={hint}>
        {label}
      </div>
      <div className="text-lg font-bold font-mono mt-1 truncate">{value}</div>
    </div>
  );
}

function Counts({
  title,
  rows,
  names,
}: {
  title: string;
  rows: Array<{ key: string; count: number }>;
  names?: Record<string, string>;
}) {
  return (
    <div className="rounded-xl border bg-white dark:bg-slate-950/40 p-3 min-w-0">
      <div className="text-xs font-bold mb-2">{title}</div>
      {rows.length === 0 ? (
        <div className="text-xs text-slate-400">مفيش</div>
      ) : (
        <ul className="space-y-1">
          {rows.slice(0, 8).map((row) => (
            <li key={row.key} className="flex justify-between gap-2 text-xs">
              <span className="truncate">{names?.[row.key] ?? row.key}</span>
              <span className="font-mono">{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const usd = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : `$${value.toFixed(value < 1 ? 4 : 2)}`;
const ms = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : `${(value / 1000).toFixed(1)} ث`;

function VoiceCallsDashboard() {
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const stats = trpc.voice.adminStats.useQuery({ days });
  const data = stats.data;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-600" /> المكالمات
        </h3>
        <div className="flex gap-1">
          {([1, 7, 30] as const).map((d) => (
            <Button
              key={d}
              type="button"
              size="sm"
              variant={d === days ? "default" : "outline"}
              onClick={() => setDays(d)}
            >
              {d === 1 ? "النهارده" : `آخر ${d} يوم`}
            </Button>
          ))}
        </div>
      </div>
      {stats.isLoading ? (
        <div className="text-xs text-slate-500">بيحمّل…</div>
      ) : stats.error || !data ? (
        <div className="text-xs text-rose-600">
          مش قادر أجيب الإحصائيات دلوقتي.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="مكالمات" value={String(data.calls)} />
            <Stat label="متصلين" value={String(data.callers)} />
            <Stat label="دقايق" value={String(data.minutes)} />
            <Stat
              label="متوسط المكالمة"
              value={`${data.averageCallSeconds} ث`}
            />
            <Stat
              label="التكلفة عند جوجل"
              value={usd(data.costUsd)}
              hint="الصوت الحي + موديلات الأدوات"
            />
            <Stat label="تكلفة الدقيقة" value={usd(data.costPerMinuteUsd)} />
            <Stat
              label="أول صوت (الوسيط)"
              value={ms(data.firstAudioMs.p50)}
              hint="من ما المستخدم يسكت لحد أول صوت من المساعد"
            />
            <Stat label="أول صوت (p95)" value={ms(data.firstAudioMs.p95)} />
            <Stat
              label="أدوات لكل مكالمة"
              value={String(data.toolCallsPerCall)}
            />
            <Stat
              label="رجوع الخط لكل مكالمة"
              value={String(data.reconnectsPerCall)}
            />
            <Stat label="تكلفة موديلات الأدوات" value={usd(data.toolCostUsd)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Counts
              title="المكالمة خلصت ليه"
              rows={data.endReasons}
              names={END_REASONS}
            />
            <Counts title="المشاكل (الحوادث)" rows={data.incidents} />
            <Counts title="ذاكرة ما بعد المكالمة" rows={data.memory} />
            <Counts title="الجهاز" rows={data.clients} />
          </div>
          {data.models.length > 0 && (
            <div className="rounded-xl border bg-white dark:bg-slate-950/40 p-3 overflow-x-auto">
              <div className="text-xs font-bold mb-2">حسب الموديل</div>
              <table className="w-full text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="text-start font-medium">الموديل</th>
                    <th className="text-start font-medium">مكالمات</th>
                    <th className="text-start font-medium">دقايق</th>
                    <th className="text-start font-medium">التكلفة</th>
                    <th className="text-start font-medium">للدقيقة</th>
                  </tr>
                </thead>
                <tbody>
                  {data.models.map((model) => (
                    <tr key={model.key} className="border-t">
                      <td className="py-1 font-mono">{model.key}</td>
                      <td className="font-mono">{model.count}</td>
                      <td className="font-mono">{model.minutes}</td>
                      <td className="font-mono">{usd(model.costUsd)}</td>
                      <td className="font-mono">
                        {model.minutes > 0
                          ? usd(model.costUsd / model.minutes)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.recent.length > 0 && (
            <div className="rounded-xl border bg-white dark:bg-slate-950/40 p-3 overflow-x-auto">
              <div className="text-xs font-bold mb-2">آخر المكالمات</div>
              <table className="w-full text-xs whitespace-nowrap">
                <thead className="text-slate-500">
                  <tr>
                    <th className="text-start font-medium pe-3">البداية</th>
                    <th className="text-start font-medium pe-3">المستخدم</th>
                    <th className="text-start font-medium pe-3">المدة</th>
                    <th className="text-start font-medium pe-3">الجهاز</th>
                    <th className="text-start font-medium pe-3">خلصت ليه</th>
                    <th className="text-start font-medium pe-3">أول صوت</th>
                    <th className="text-start font-medium pe-3">مشاكل</th>
                    <th className="text-start font-medium pe-3">الذاكرة</th>
                    <th className="text-start font-medium">التكلفة</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((call) => (
                    <tr key={call.id} className="border-t">
                      <td className="py-1 pe-3">
                        {new Date(call.startedAt).toLocaleString("ar-EG", {
                          timeZone: "Africa/Cairo",
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="pe-3 font-mono">{call.user}</td>
                      <td className="pe-3 font-mono">{call.seconds} ث</td>
                      <td className="pe-3">{call.client ?? "—"}</td>
                      <td className="pe-3">
                        {call.endReason
                          ? (END_REASONS[call.endReason] ?? call.endReason)
                          : "شغالة"}
                      </td>
                      <td className="pe-3 font-mono">
                        {ms(call.firstAudioP50)}
                      </td>
                      <td className="pe-3 font-mono">{call.incidents}</td>
                      <td className="pe-3">{call.memory}</td>
                      <td className="font-mono">{usd(call.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The coach call: its model and thinking level, and who gets it. Nobody until users are listed or a percent is set;
 * raising the percent keeps everyone who already had it (a stable hash of the user, api/services/entitlements/voice.ts).
 */
function CoachSettings({ formData, updateField }: Props) {
  const percent = formData.voice_coach_rollout_percent ?? "0";
  return (
    <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-4">
      <div>
        <div className="font-bold text-sm">سمارت المدرب و«تفكير أعمق»</div>
        <p className="text-xs text-slate-500 mt-1">
          المدرب: تعليمات وأدوات بتقرا الالتزامات والديون والأقساط والخطة، وكل
          حسبة بتتعمل في الكود مش في الموديل، على موديل الباقة العادي.
          مابيتفعّلش لحد غير اللي في القايمة أو النسبة: حسابات تجربة، وبعدين ٥٪
          ثم ٢٥٪ ثم ١٠٠٪ بعد ما النتايج تعدّي. «تفكير أعمق» زرار في شاشة
          المكالمة لمستخدمين المدرب في الباقات اللي تفعّلها تحت: بينقل المكالمة
          للموديل اللي بيفكر أعمق، وهو أبطأ وبيستهلك توكنز أكتر. الاختبارات رصدت
          طلبات أدوات ماوصلتش للتطبيق؛ سببها الداخلي لسه مش محسوم، والاسترداد
          محدود ومش دليل نجاح المهمة. سيبه مقفول لحد ما التقييم يعدّي وحدود
          المشروع تسمح.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <FieldLabel hint="موديل «تفكير أعمق». مابيتبدلش لوحده لو فشل: المكالمة بتقول كده وترجع للعادي قدام المستخدم.">
            موديل «تفكير أعمق»
          </FieldLabel>
          <Select
            value={
              formData.voice_coach_model || "gemini-3.8-live-extended-thinking"
            }
            onValueChange={(v) => updateField("voice_coach_model", v)}
          >
            <SelectTrigger className="h-8 bg-slate-50 dark:bg-slate-900 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VOICE_LIVE_MODELS.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <FieldLabel hint="low هو اللي بيتأهل دلوقتي (قرار 0017). medium أبطأ وماظهرش فرق مثبت؛ high اتقاس وفشل. غيّره بس بعد تقييم.">
            مستوى التفكير
          </FieldLabel>
          <Select
            value={formData.voice_coach_thinking_level || "low"}
            onValueChange={(v) => updateField("voice_coach_thinking_level", v)}
          >
            <SelectTrigger className="h-8 bg-slate-50 dark:bg-slate-900 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VOICE_THINKING_LEVELS.map((level) => (
                <SelectItem key={level} value={level}>
                  {level}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <FieldLabel hint="نسبة المستخدمين اللي بياخدوا المدرب (٠–١٠٠). نفس المستخدم بيفضل جوه لما النسبة تزيد.">
            نسبة طرح المدرب (٪)
          </FieldLabel>
          <Input
            type="number"
            min="0"
            max="100"
            step="1"
            value={percent}
            onChange={(e) =>
              updateField("voice_coach_rollout_percent", e.target.value)
            }
            className="h-8 font-mono bg-slate-50 dark:bg-slate-900"
          />
        </div>
        <div className="space-y-1">
          <FieldLabel hint="حسابات بتاخد المدرب دايماً، مفصولة بفاصلة: local:12,oauth:7 (نوع الحساب ورقمه).">
            حسابات التجربة
          </FieldLabel>
          <Input
            dir="ltr"
            value={formData.voice_coach_allowlist ?? ""}
            onChange={(e) =>
              updateField("voice_coach_allowlist", e.target.value)
            }
            placeholder="local:12,oauth:7"
            className="h-8 font-mono bg-slate-50 dark:bg-slate-900"
          />
        </div>
      </div>
      <div className="space-y-2">
        <FieldLabel hint="الباقة هنا اشتراك المستخدم في SmartSpend، مش صلاحية الأدمن ومش باقة جوجل.">
          «تفكير أعمق» متاح في باقة
        </FieldLabel>
        <div className="flex flex-wrap gap-4">
          {PLANS.map((plan) => {
            const key = `voice_ultra_enabled_${plan.key}`;
            return (
              <label key={key} className="flex items-center gap-2 text-xs">
                <Switch
                  checked={formData[key] === "true"}
                  onCheckedChange={(checked) =>
                    updateField(key, String(checked))
                  }
                />
                {plan.label}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Live calls at once, from the Google project's real limits: one pool per model across all servers. */
function CapacitySettings({ formData, updateField }: Props) {
  const fields = [
    {
      key: "voice_max_concurrent_calls",
      fallback: "20",
      label: "مكالمات في نفس الوقت (الموديل العادي)",
    },
    {
      key: "voice_ultra_max_concurrent_calls",
      fallback: "3",
      label: "مكالمات في نفس الوقت («تفكير أعمق»)",
    },
    {
      key: "voice_max_calls_per_user",
      fallback: "1",
      label: "مكالمات شغالة لكل مستخدم",
    },
    {
      key: "voice_standard_input_tpm",
      fallback: "65000",
      label: "حد توكنز الإدخال في الدقيقة — العادي",
    },
    {
      key: "voice_standard_reserved_tpm",
      fallback: "30000",
      label: "توكنز محجوزة لكل مكالمة في الدقيقة — العادي",
    },
    {
      key: "voice_ultra_input_tpm",
      fallback: "65000",
      label: "حد توكنز الإدخال في الدقيقة — التفكير الأعمق",
    },
    {
      key: "voice_ultra_reserved_tpm",
      fallback: "60000",
      label: "توكنز محجوزة لكل مكالمة في الدقيقة — التفكير الأعمق",
    },
  ];
  return (
    <div className="space-y-2">
      <FieldLabel hint="اقرأ حدود كل موديل من AI Studio. العدد الفعلي هو الأقل من سقف المكالمات و80% من حد التوكنز مقسومًا على حجز المكالمة. الحجز تقدير يُراجع من الاستخدام الفعلي؛ 0 في حد التوكنز يعني أنه غير معروف. حد العادي المبلغ عنه 65 ألف؛ بالإعدادات الحالية مكالمة واحدة. التفكير الأعمق مقفول حتى التأهيل.">
        السعة
      </FieldLabel>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {fields.map((field) => (
          <div key={field.key} className="space-y-1">
            <span className="text-xs text-slate-500">{field.label}</span>
            <Input
              type="number"
              min="0"
              step="1"
              value={formData[field.key] ?? field.fallback}
              aria-label={field.label}
              onChange={(e) => updateField(field.key, e.target.value)}
              className="h-8 font-mono bg-slate-50 dark:bg-slate-900"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminVoiceCallSection({ formData, updateField }: Props) {
  const killSwitch = formData.voice_v2_kill_switch === "true";
  const defaultModel = formData.voice_v2_model || VOICE_LIVE_MODELS[0].id;
  const usesThinking = [
    defaultModel,
    ...PLANS.map((plan) => formData[`voice_v2_model_${plan.key}`]),
  ].includes("gemini-3.8-live-extended-thinking");

  return (
    <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden border-t-4 border-t-emerald-500 mt-8">
      <SectionHeader
        icon={<PhoneCall className="w-6 h-6 text-emerald-600" />}
        title="المكالمة الصوتية «كلّم سمارت»"
        description="بأنهي موديل، وبكام في اليوم، ولوحة المكالمات. الدقايق ومدة المكالمة لكل باقة من القسم اللي فوق. اضغط «حفظ وتنفيذ الإعدادات» بعد أي تعديل."
      />
      <CardContent className="p-6 space-y-8">
        {/* Stop everything */}
        <div className="space-y-2 max-w-md">
          <FieldLabel hint="بيمنع مكالمات جديدة لكل الناس، حتى الأدمن. المكالمات الجارية بتتقفل عند مراجعة حالتها وإعداداتها، عادة خلال 15–25 ثانية مع Redis. أي تأكيد جديد بيتراجع قبل الحفظ.">
            إيقاف المكالمات للكل
          </FieldLabel>
          <div className="flex items-center gap-3">
            <Switch
              checked={killSwitch}
              onCheckedChange={(checked) =>
                updateField("voice_v2_kill_switch", String(checked))
              }
            />
            <span
              className={`text-xs font-bold ${killSwitch ? "text-rose-600" : "text-emerald-600"}`}
            >
              {killSwitch ? "متوقفة" : "شغالة"}
            </span>
          </div>
        </div>

        {/* Models and cost caps */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <FieldLabel hint="الموديل اللي بيسمع ويتكلم في المكالمة العادية. Extended Thinking بيفكر في الخلفية وبياخد وقت أطول؛ تكلفته الحقيقية بتبان في لوحة المكالمات من التوكنز الفعلية.">
              موديل الصوت الافتراضي
            </FieldLabel>
            <Select
              value={defaultModel}
              onValueChange={(v) => updateField("voice_v2_model", v)}
            >
              <SelectTrigger className="bg-slate-50 dark:bg-slate-900 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOICE_LIVE_MODELS.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <FieldLabel hint="بيتقري بس مع موديل Extended Thinking. أعلى = أعمق وأبطأ وأغلى.">
              مستوى التفكير
            </FieldLabel>
            <Select
              value={formData.voice_v2_thinking_level || "low"}
              onValueChange={(v) => updateField("voice_v2_thinking_level", v)}
              disabled={!usesThinking}
            >
              <SelectTrigger className="bg-slate-50 dark:bg-slate-900 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOICE_THINKING_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const modelKey = `voice_v2_model_${plan.key}`;
            const capKey = `voice_daily_cost_cap_usd_${plan.key}`;
            return (
              <div
                key={plan.key}
                className="p-4 rounded-xl border bg-white dark:bg-slate-950/40 space-y-3"
              >
                <div className="font-bold text-xs">باقة {plan.label}</div>
                <div className="space-y-1">
                  <FieldLabel>موديل الصوت</FieldLabel>
                  <Select
                    value={formData[modelKey] || SAME_AS_DEFAULT}
                    onValueChange={(v) =>
                      updateField(modelKey, v === SAME_AS_DEFAULT ? "" : v)
                    }
                  >
                    <SelectTrigger className="h-8 bg-slate-50 dark:bg-slate-900 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SAME_AS_DEFAULT}>
                        زي الافتراضي
                      </SelectItem>
                      {VOICE_LIVE_MODELS.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <FieldLabel hint="أقصى تكلفة عند جوجل لكل مستخدم في اليوم (بتوقيت القاهرة). قبل ما يوصلها بيتنبّه، وعندها المكالمة بتقفل بهدوء، ومابتتقفلش وسط موافقة. ٠ = من غير سقف.">
                    سقف التكلفة اليومي ($)
                  </FieldLabel>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData[capKey] ?? ""}
                    onChange={(e) => updateField(capKey, e.target.value)}
                    className="h-8 font-mono bg-slate-50 dark:bg-slate-900"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <CoachSettings formData={formData} updateField={updateField} />

        <CapacitySettings formData={formData} updateField={updateField} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TEXT_MODEL_SETTINGS.map((setting) => (
            <div key={setting.key} className="space-y-1">
              <FieldLabel hint={setting.hint}>{setting.label}</FieldLabel>
              <Select
                value={formData[setting.key] || setting.fallback}
                onValueChange={(v) => updateField(setting.key, v)}
              >
                <SelectTrigger className="h-8 bg-slate-50 dark:bg-slate-900 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GEMINI_TEXT_MODELS.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 pt-6">
          <VoiceCallsDashboard />
        </div>
      </CardContent>
    </Card>
  );
}
