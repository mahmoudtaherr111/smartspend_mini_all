import { Link } from "react-router-dom";
import { SEOMeta } from "@/components/seo/SEOMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-10" dir="rtl">
      <SEOMeta path="/privacy" title="سياسة الخصوصية - SmartSpend AI" />
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" asChild className="mb-2">
          <Link to="/">الرئيسية</Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">سياسة الخصوصية</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
            <p>
              SmartSpend AI يجمع بيانات الحساب والعمليات المالية التي تدخلها
              بنفسك لغرض تقديم الخدمة (التصنيف، التقارير، والتحليل). لا تستخدم
              هذه الصفحة كمستند قانوني نهائي — راجع مع مستشار قانوني قبل
              الإنتاج.
            </p>
            <p>
              يمكنك طلب تصدير بياناتك أو حذف حسابك لاحقاً عبر ميزات سنضيفها في
              الإعدادات وفق لوائح حماية البيانات المعمول بها في منطقتك.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
