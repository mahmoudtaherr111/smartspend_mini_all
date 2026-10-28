/**
 * Capture from phones, in the admin console (decisions 0028 and 0030): the switch that opens it, the bank and kind
 * pairs recorded without a question for everyone, the banks paused from that, the transfer to a person that is always
 * asked about, and how many question notifications a user gets a day. The monthly limit per plan is in each plan's
 * tab. Settings are saved with the rest of the settings form.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Smartphone } from "lucide-react";
import { FieldLabel, SectionHeader } from "./AdminSettingsShared";

interface Props {
  formData: Record<string, string>;
  updateField: (key: string, value: string) => void;
}

export function AdminCaptureSection({ formData, updateField }: Props) {
  // Absent means off: capture opens only when the admin says so.
  const enabled = formData.capture_enabled === "true";
  return (
    <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden border-t-4 border-t-emerald-500 mt-8">
      <SectionHeader
        icon={<Smartphone className="w-6 h-6 text-emerald-600" />}
        title="تسجيل العمليات من رسايل البنك على الموبايل"
        description="الموبايل بيبعت إشعارات البنوك والمحافظ، والسيرفر بيقراها ويسأل المستخدم عن كل عملية، إلا الأنواع اللي اتفتحت تتسجل لوحدها. الحد الشهري لكل باقة في تاب الباقة. اضغط «حفظ وتنفيذ الإعدادات» بعد أي تعديل."
      />
      <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <FieldLabel hint="لو اتقفل، السيرفر بيرفض كل الرسايل والموبايلات بتقف لحد ما يتفتح تاني.">التسجيل من رسايل البنك</FieldLabel>
          <div className="flex items-center gap-3">
            <Switch
              checked={enabled}
              aria-label="التسجيل من رسايل البنك"
              onCheckedChange={(checked) => updateField("capture_enabled", String(checked))}
            />
            <span className={`text-xs font-bold ${enabled ? "text-emerald-600" : "text-rose-600"}`}>{enabled ? "شغال" : "مقفول"}</span>
          </div>
        </div>
        <div className="space-y-2">
          <FieldLabel hint="بنك ونوع رسالة بيتسجلوا لوحدهم للكل، بعد ما الدقة على رسايل حقيقية تثبت. بالشكل cib:card_purchase، أو *:card_purchase لكل البنوك، ومفصولين بفاصلة. فاضي = كل حاجة بتتسأل (إلا اللي المستخدم وافق عليه بنفسه).">
            الأنواع اللي بتتسجل لوحدها
          </FieldLabel>
          <Input
            aria-label="الأنواع اللي بتتسجل لوحدها"
            value={formData.capture_auto_pairs ?? ""}
            onChange={(e) => updateField("capture_auto_pairs", e.target.value)}
            className="h-8 font-mono bg-slate-50 dark:bg-slate-900"
            dir="ltr"
          />
        </div>
        <div className="space-y-2">
          <FieldLabel hint="بنوك عمليتها مابتتسجلش لوحدها أبداً، مثلاً بنك غيّر شكل رسايله. الـ slug من قايمة رسايل البنوك، ومفصولين بفاصلة.">
            بنوك موقفة عن التسجيل لوحدها
          </FieldLabel>
          <Input
            aria-label="بنوك موقفة عن التسجيل لوحدها"
            value={formData.capture_paused_sources ?? ""}
            onChange={(e) => updateField("capture_paused_sources", e.target.value)}
            className="h-8 font-mono bg-slate-50 dark:bg-slate-900"
            dir="ltr"
          />
        </div>
        <div className="space-y-2">
          <FieldLabel hint="تحويل لشخص أو من شخص بالمبلغ ده أو أكتر بيتسأل عنه قبل ما يتسجل، لإنه ممكن يكون بين حسابات المستخدم.">
            سؤال قبل تسجيل تحويل شخص من (ج.م)
          </FieldLabel>
          <Input
            type="number"
            min="0"
            aria-label="سؤال قبل تسجيل تحويل شخص من"
            value={formData.capture_p2p_ask_above ?? "1000"}
            onChange={(e) => updateField("capture_p2p_ask_above", e.target.value)}
            className="h-8 font-mono bg-slate-50 dark:bg-slate-900 max-w-[12rem]"
          />
        </div>
        <div className="space-y-2">
          <FieldLabel hint="عدد إشعارات الأسئلة للمستخدم في اليوم (بتوقيت القاهرة). الباقي بيستنى في التطبيق.">إشعارات الأسئلة في اليوم</FieldLabel>
          <Input
            type="number"
            min="0"
            aria-label="إشعارات الأسئلة في اليوم"
            value={formData.capture_daily_question_notices ?? "2"}
            onChange={(e) => updateField("capture_daily_question_notices", e.target.value)}
            className="h-8 font-mono bg-slate-50 dark:bg-slate-900 max-w-[12rem]"
          />
        </div>
      </CardContent>
    </Card>
  );
}
