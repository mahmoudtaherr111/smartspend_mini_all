import { Input } from "@admin/kit/input";
import { SettingsEditor } from "../../ui/SettingsEditor";

type Props = { formData: Record<string, string>; updateField: (key: string, value: string) => void };

const SPEECH_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash", "whisper-large-v3-turbo", "whisper-large-v3"];

function Select({ id, value, onChange, options }: { id: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return (
    <select id={id} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
  );
}

function SpeechPlan({ formData, updateField, plan, title }: Props & { plan: "free" | "pro"; title: string }) {
  const provider = formData[`${plan}_stt_provider`] || "gemini";
  return (
    <section className="rounded-xl border p-4">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm" htmlFor={`${plan}-stt-provider`}>
          <span className="font-semibold">الخدمة</span>
          <Select id={`${plan}-stt-provider`} value={provider} onChange={(value) => updateField(`${plan}_stt_provider`, value)}
            options={[["gemini", "Google Gemini"], ["groq", "Groq (Whisper)"]]} />
        </label>
        <label className="space-y-1 text-sm" htmlFor={`${plan}-stt-model`}>
          <span className="font-semibold">الموديل</span>
          <Input id={`${plan}-stt-model`} dir="ltr" list="speech-models" value={formData[`${plan}_stt_model`] ?? ""} placeholder={provider === "groq" ? "whisper-large-v3-turbo" : "gemini-3.5-flash-lite"}
            onChange={(e) => updateField(`${plan}_stt_model`, e.target.value.trim())} />
        </label>
        {provider === "gemini" && (
          <label className="space-y-1 text-sm" htmlFor={`${plan}-stt-slot`}>
            <span className="font-semibold">المفتاح</span>
            <Select id={`${plan}-stt-slot`} value={formData[`${plan}_stt_key_slot`] || "key1"} onChange={(value) => updateField(`${plan}_stt_key_slot`, value)}
              options={[["key1", "مفتاح الصوت الأساسي"], ["key2", "مفتاح الصوت التاني"]]} />
          </label>
        )}
      </div>
    </section>
  );
}

/**
 * Voice notes turned into text before they are read as expenses. It runs outside the connectors: Gemini or Groq, with
 * the server's keys, per plan, and one fallback model when the first fails.
 */
export function SpeechToText() {
  return (
    <SettingsEditor>
      {(props) => (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            لما المستخدم يسجّل مصروف بصوته، الصوت بيتحوّل لكلام الأول، وبعدها بيتقري زي أي جملة. التحويل ده بيشتغل بمفاتيح السيرفر (تبويب «مفاتيح
            السيرفر»)، مش بالموصلات. باقة Ultra بتستخدم إعداد Pro.
          </p>
          <datalist id="speech-models">{SPEECH_MODELS.map((model) => <option key={model} value={model} />)}</datalist>
          <SpeechPlan {...props} plan="free" title="المجانية" />
          <SpeechPlan {...props} plan="pro" title="Pro وUltra" />
          <section className="rounded-xl border p-4">
            <label className="space-y-1 text-sm" htmlFor="stt-fallback">
              <span className="font-semibold">الموديل الاحتياطي</span>
              <Input id="stt-fallback" dir="ltr" list="speech-models" className="max-w-sm" value={props.formData.stt_fallback_model ?? ""}
                onChange={(e) => props.updateField("stt_fallback_model", e.target.value.trim())} />
              <span className="block text-xs text-muted-foreground">بيتجرب لو الموديل الأساسي ماردش. اسم موديل Gemini قديم بيتحوّل لوحده لأقرب موديل شغال.</span>
            </label>
          </section>
        </div>
      )}
    </SettingsEditor>
  );
}

const KEYS: { key: string; label: string; hint: string }[] = [
  { key: "ai_api_key", label: "مفتاح Gemini الأساسي", hint: "بيرد في أي وظيفة مالهاش موديل في «الوظايف»، وفي التقارير اللي مالهاش موديل." },
  { key: "ai_api_key_2", label: "مفتاح Gemini التاني", hint: "بيتجرب لو الأساسي فاضي." },
  { key: "stt_api_key", label: "مفتاح الصوت الأساسي (Gemini)", hint: "لتحويل الصوت لكلام. لو فاضي، بيستخدم مفتاح Gemini الأساسي." },
  { key: "stt_api_key_2", label: "مفتاح الصوت التاني (Gemini)", hint: "للباقات اللي مختار لها «مفتاح الصوت التاني»." },
  { key: "groq_api_key", label: "مفتاح Groq", hint: "لتحويل الصوت بـ Whisper، واحتياطي في فهم الجمل." },
  { key: "fireworks_api_key", label: "مفتاح Fireworks", hint: "احتياطي في فهم الجمل لو مفيش موصل." },
  { key: "nvidia_api_key", label: "مفتاح NVIDIA", hint: "احتياطي في فهم الجمل لو مفيش موصل." },
];

/**
 * Keys the server holds itself, for the paths that do not read connectors yet and as the last fallback. A saved key
 * comes back as dots and its last four characters; sending the dots back leaves it as it is.
 */
export function ServerKeys() {
  return (
    <SettingsEditor>
      {(props) => (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            الموصلات هي المكان الأساسي للمفاتيح. المفاتيح دي للحاجات اللي لسه مابتقراش الموصلات (تحويل الصوت لكلام) وكآخر احتياطي. المفتاح المحفوظ
            بيظهر نقط وآخر 4 حروف بس؛ عشان تغيّره اكتب الجديد مكانه.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {KEYS.map((item) => (
              <label key={item.key} className="space-y-1 rounded-xl border p-3 text-sm" htmlFor={`key-${item.key}`}>
                <span className="font-semibold">{item.label}</span>
                <Input id={`key-${item.key}`} dir="ltr" type="password" autoComplete="off" value={props.formData[item.key] ?? ""}
                  onChange={(e) => props.updateField(item.key, e.target.value.trim())} />
                <span className="block text-xs text-muted-foreground">{item.hint}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </SettingsEditor>
  );
}
