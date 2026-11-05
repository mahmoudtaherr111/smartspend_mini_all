import { Input } from "@admin/kit/input";
import { Switch } from "@admin/kit/switch";
import { SettingsEditor } from "../../ui/SettingsEditor";

type Props = { formData: Record<string, string>; updateField: (key: string, value: string) => void };

/** A switch that is on unless the admin set it to "false" (the server's own rule for these keys). */
function OnUnlessOff({ formData, updateField, name, label, hint }: Props & { name: string; label: string; hint: string }) {
  const on = formData[name] !== "false";
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <Switch checked={on} aria-label={label} onCheckedChange={(checked) => updateField(name, String(checked))} />
    </li>
  );
}

function NumberField({ formData, updateField, name, label, hint, fallback, prefix }: Props & { name: string; label: string; hint: string; fallback: string; prefix?: string }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-semibold" htmlFor={name}>{label}</label>
      <div className="flex items-center gap-2">
        {prefix && <span className="text-sm">{prefix}</span>}
        <Input id={name} dir="ltr" inputMode="decimal" className="w-32" value={formData[name] ?? fallback} onChange={(e) => updateField(name, e.target.value.replace(/[^\d.]/g, ""))} />
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Capture's switches and limits, in one place, saved with the save bar like every other setting. */
export function CaptureSettings() {
  return (
    <SettingsEditor>
      {(props) => (
        <div className="space-y-4">
          <section className="rounded-xl border p-4">
            <h3 className="font-semibold">التشغيل</h3>
            <ul className="divide-y">
              <OnUnlessOff {...props} name="capture_enabled" label="تسجيل رسايل البنك" hint="لو قفلته، الموبايلات بتبطّل تبعت والرسايل اللي في الطابور بتستنى." />
              <OnUnlessOff {...props} name="sms_ai_enabled" label="قراءة الذكاء الاصطناعي" hint="هو اللي بيقرا كل رسالة. لو قفلته، الرسايل بتستنى ومابتتسجلش." />
              <OnUnlessOff {...props} name="capture_questions_enabled" label="أسئلة «صرفتها في إيه»" hint="تسمح للمستخدم يفتح الأسئلة بعد الحفظ من إعداداته. كل مستخدم بيقرر لنفسه." />
            </ul>
            <div className="mt-2 flex items-center justify-between gap-4 border-t pt-3">
              <div>
                <div className="text-sm font-semibold">حفظ عينات الرسايل</div>
                <div className="text-xs text-muted-foreground">بنحتفظ برسايل متخبّي منها الأرقام، من اللي وافقوا بس، عشان نحسّن القراية. مقفولة لحد ما المحامي يوافق على مدة الحفظ.</div>
              </div>
              <Switch checked={props.formData.capture_samples_enabled === "true"} aria-label="حفظ عينات الرسايل" onCheckedChange={(on) => props.updateField("capture_samples_enabled", String(on))} />
            </div>
          </section>

          <section className="grid gap-4 rounded-xl border p-4 md:grid-cols-2">
            <h3 className="font-semibold md:col-span-2">الحدود</h3>
            <NumberField {...props} name="capture_monthly_limit_free" fallback="50" label="عمليات في الشهر (المجانية)" hint="بعدها العمليات بتتعلق وتتسجل لو اشترك. 0 = من غير حد." />
            <NumberField {...props} name="capture_monthly_limit_pro" fallback="0" label="عمليات في الشهر (Pro)" hint="0 = من غير حد." />
            <NumberField {...props} name="capture_daily_signal_limit" fallback="1000" label="رسايل في اليوم لكل مستخدم" hint="حماية من موبايل بيبعت رسايل كتير غلط. بعدها الموبايل بيستنى لنص الليل." />
            <NumberField {...props} name="capture_daily_question_notices" fallback="2" label="إشعارات الأسئلة في اليوم" hint="الباقي بيستنى جوه التطبيق." />
            <NumberField {...props} name="capture_ai_daily_cost_cap_usd" fallback="50" prefix="$" label="سقف تكلفة القراية في اليوم" hint="لكل المستخدمين مع بعض. بعده الرسايل بتستنى لبكره، ومابتضيعش. لازم أكبر من صفر." />
            <NumberField {...props} name="capture_ai_concurrency" fallback="64" label="قرايات في نفس الوقت" hint="أقصى عدد نداءات للموديل شغالة مع بعض." />
          </section>

          <section className="space-y-3 rounded-xl border p-4">
            <h3 className="font-semibold">لمين</h3>
            <div className="space-y-1">
              <label className="text-sm font-semibold" htmlFor="capture_beta_users">مستخدمين التجربة بس</label>
              <Input id="capture_beta_users" dir="ltr" placeholder="local:12, oauth:7" value={props.formData.capture_beta_users ?? ""} onChange={(e) => props.updateField("capture_beta_users", e.target.value)} />
              <p className="text-xs text-muted-foreground">فاضي = لكل الناس.</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold" htmlFor="capture_paused_sources">بنوك موقفة عن التسجيل لوحدها</label>
              <Input id="capture_paused_sources" dir="ltr" placeholder="cib, nbe" value={props.formData.capture_paused_sources ?? ""} onChange={(e) => props.updateField("capture_paused_sources", e.target.value)} />
              <p className="text-xs text-muted-foreground">رسايلها بتتقري وبتستنى المستخدم يأكدها. النظام بيوقف بنك لوحده لو المستخدمين لغوا عمليات كتير منه.</p>
            </div>
          </section>
        </div>
      )}
    </SettingsEditor>
  );
}
