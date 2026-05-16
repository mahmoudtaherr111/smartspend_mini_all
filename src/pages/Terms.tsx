import { Link } from "react-router-dom";
import { SEOMeta } from "@/components/seo/SEOMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-10" dir="rtl">
      <SEOMeta path="/terms" title="شروط الاستخدام - SmartSpend AI" />
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" asChild className="mb-2">
          <Link to="/">الرئيسية</Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">شروط الاستخدام</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
            <p>
              باستخدام SmartSpend AI فإنك توافق على الالتزام بقواعد الاستخدام المعقولة وعدم إساءة استخدام الخدمة أو
              محاولة الوصول لبيانات مستخدمين آخرين. المحتوى التحليلي بالذكاء الاصطناعي إرشادي وليس استشارة مالية
              رسمية.
            </p>
            <p>هذا نص مبدئي للتطوير — يجب استبداله بنسخة قانونية كاملة قبل الإطلاق العلني.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
