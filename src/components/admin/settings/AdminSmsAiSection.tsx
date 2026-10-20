/**
 * The model that reads bank and wallet messages, in the admin console: the switch that stops it for everyone and the
 * daily cost cap in USD (decision 0025). Which provider and model read them is chosen in the AI providers screen,
 * under the "قراءة رسايل البنوك والمحافظ" purpose. Settings are saved with the rest of the settings form.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { MessageSquareText } from "lucide-react";
import { FieldLabel, SectionHeader } from "./AdminSettingsShared";

interface Props {
  formData: Record<string, string>;
  updateField: (key: string, value: string) => void;
}

export function AdminSmsAiSection({ formData, updateField }: Props) {
  // Absent means on: the server reads anything but "false" as on.
  const enabled = formData.sms_ai_enabled !== "false";

  return (
    <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden border-t-4 border-t-sky-500 mt-8">
      <SectionHeader
        icon={<MessageSquareText className="w-6 h-6 text-sky-600" />}
        title="قراءة رسايل البنوك بالذكاء الاصطناعي"
        description="الموديل بيقرا بس الرسايل اللي القوالب مش متأكدة منها، بعد ما الأسماء وأرقام الكروت والحسابات والتليفونات والمراجع تتشال. المزود والموديل من شاشة مزودي الذكاء الاصطناعي، غرض «قراءة رسايل البنوك والمحافظ»؛ من غيره بيقرا بمفتاح Gemini بتاع السيرفر مؤقتًا. اضغط «حفظ وتنفيذ الإعدادات» بعد أي تعديل."
      />
      <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <FieldLabel hint="لو اتقفل، ولا رسالة بتروح لموديل. الرسايل بتتقري بالقوالب، واللي ماتقريتش بتفضل محفوظة بسببها ومابتضيعش.">
            الموديل لرسايل البنوك
          </FieldLabel>
          <div className="flex items-center gap-3">
            <Switch
              checked={enabled}
              aria-label="الموديل لرسايل البنوك"
              onCheckedChange={(checked) => updateField("sms_ai_enabled", String(checked))}
            />
            <span className={`text-xs font-bold ${enabled ? "text-emerald-600" : "text-rose-600"}`}>
              {enabled ? "شغال" : "مقفول"}
            </span>
          </div>
        </div>
        <div className="space-y-2">
          <FieldLabel hint="أقصى تكلفة عند المزود لكل المستخدمين في اليوم (بتوقيت القاهرة)، محسوبة من أسعار الموديلات في شاشة المزودين. لما توصل، الرسايل بتتقري بالقوالب لحد بكره. مع سقف، الموديل اللي مالوش سعر مابيتطلبش. ٠ = من غير سقف.">
            سقف التكلفة اليومي ($)
          </FieldLabel>
          <Input
            type="number"
            min="0"
            step="0.01"
            aria-label="سقف التكلفة اليومي لرسايل البنوك"
            value={formData.sms_ai_daily_cost_cap_usd ?? "0"}
            onChange={(e) => updateField("sms_ai_daily_cost_cap_usd", e.target.value)}
            className="h-8 font-mono bg-slate-50 dark:bg-slate-900 max-w-[12rem]"
          />
        </div>
      </CardContent>
    </Card>
  );
}
