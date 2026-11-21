/**
 * The controls for a bad day, in the admin console: stop one AI feature for everyone, set the ceiling on what AI costs
 * in a day, and require a newer mobile build. They take effect without a deployment and are saved with the rest of the
 * settings.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Power } from "lucide-react";
import { FieldLabel, SectionHeader } from "./AdminSettingsShared";

interface Props {
  formData: Record<string, string>;
  updateField: (key: string, value: string) => void;
}

const SWITCHES = [
  ["ai_off_parse", "فهم الجمل والتسجيل بالذكاء"],
  ["ai_off_chat", "المحادثة مع المساعد"],
  ["ai_off_speech", "التسجيل بالصوت"],
  ["ai_off_image", "قراءة الفواتير"],
  ["ai_off_report", "التقارير الذكية"],
  ["ai_off_goal", "تحليل الأهداف"],
  ["ai_off_business", "ذكاء حساب الشغل"],
] as const;

const FIELDS = [
  ["mobile_min_version_android", "أقل إصدار أندرويد مسموح", "1.0.0"],
  ["mobile_min_version_ios", "أقل إصدار آيفون مسموح", "1.0.0"],
  ["mobile_store_url_android", "رابط Google Play", "https://play.google.com/store/apps/details?id=…"],
  ["mobile_store_url_ios", "رابط App Store", "https://apps.apple.com/app/…"],
] as const;

export function AdminOperationsSection({ formData, updateField }: Props) {
  return (
    <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-xl rounded-2xl overflow-hidden">
      <SectionHeader
        icon={<Power className="w-6 h-6 text-rose-600" />}
        title="مفاتيح التشغيل"
        description="وقّف ميزة عن كل الناس من غير نشر جديد لو حصلت مشكلة، وحدد سقف تكلفة الذكاء اليومي."
      />
      <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {SWITCHES.map(([key, label]) => {
          const on = formData[key] !== "true";
          return (
            <div key={key} className="flex items-center justify-between gap-3">
              <FieldLabel>{label}</FieldLabel>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold ${on ? "text-emerald-600" : "text-rose-600"}`}>
                  {on ? "شغالة" : "موقفة"}
                </span>
                <Switch
                  checked={on}
                  aria-label={label}
                  onCheckedChange={(checked) => updateField(key, String(!checked))}
                />
              </div>
            </div>
          );
        })}
        <div className="space-y-2">
          <FieldLabel hint="لما التكلفة توصل للرقم ده، كل ميزات الذكاء تقف لحد نص الليل بتوقيت القاهرة. صفر يعني من غير سقف.">
            سقف تكلفة الذكاء اليومي ($)
          </FieldLabel>
          <Input
            type="number"
            min="0"
            step="1"
            aria-label="سقف تكلفة الذكاء اليومي"
            value={formData.ai_daily_cost_cap_usd ?? "50"}
            onChange={(e) => updateField("ai_daily_cost_cap_usd", e.target.value)}
            className="h-8 font-mono bg-slate-50 dark:bg-slate-900 max-w-[12rem]"
          />
        </div>
        {FIELDS.map(([key, label, placeholder]) => (
          <div key={key} className="space-y-2">
            <FieldLabel>{label}</FieldLabel>
            <Input
              dir="ltr"
              aria-label={label}
              placeholder={placeholder}
              value={formData[key] ?? ""}
              onChange={(e) => updateField(key, e.target.value)}
              className="h-8 font-mono bg-slate-50 dark:bg-slate-900"
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
