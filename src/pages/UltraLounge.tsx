import { SEOMeta } from "@/components/seo/SEOMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Gem } from "lucide-react";

export default function UltraLounge() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
      <SEOMeta path="/ultra" title="مساحة ألترا - SmartSpend AI" />
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <Gem className="w-14 h-14 mx-auto text-violet-500" />
          <h1 className="text-3xl font-bold">مرحباً بمشتركي ألترا</h1>
          <p className="text-muted-foreground">هنا هنضيف مميزات حصرية للألترا قريباً (نماذج أقوى، حدود أعلى، تقارير متقدمة).</p>
        </div>
        <Card className="border-violet-200/60 dark:border-violet-900/40 bg-gradient-to-br from-violet-50/80 to-background dark:from-violet-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="w-5 h-5 text-violet-500" />
              ليه الصفحة دي؟
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>مسار محمي بـ <code className="text-xs bg-muted px-1 rounded">UltraFeatureRoute</code> عشان نقدر نضيف ميزات ألترا الحقيقية على الـ API بـ <code className="text-xs bg-muted px-1 rounded">ultraProcedure</code> من غير ما المستخدمين المجانيين يشوفوا واجهات فاضية.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
