import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { trpc } from "../providers/trpc";
import { SEOMeta } from "../components/seo/SEOMeta";
import { User } from "lucide-react";
import { SmartProfileSettings } from "@/components/profile/SmartProfileSettings";
import { SmartProfileView } from "@/components/profile/SmartProfileView";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "../hooks/usePushNotifications";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Bell, BellRing } from "lucide-react";

export default function Settings() {
  const { user } = useAuth();
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const profileQuery = trpc.profile.getSmartProfile.useQuery();
  const isProfileComplete = profileQuery.data?.profileCompleted;

  const { isSupported, isSubscribed, subscribeToPush } = usePushNotifications();

  const avatar = user?.avatar || "";

  return (
    <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
      <SEOMeta path="/settings" title="إدارة الملف الشخصي - SmartSpend AI" />
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4 mb-2">
          {avatar ? (
            <img
              src={avatar}
              alt="Profile"
              className="w-16 h-16 rounded-full object-cover border-4 border-emerald-100 shadow-sm"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center border-4 border-emerald-100 shadow-sm">
              <User className="w-8 h-8" />
            </div>
          )}
          <div>
            <h1 className="text-3xl font-bold">إدارة الملف الشخصي</h1>
            <p className="text-muted-foreground">
              تعديل بيانات حسابك الشخصي وإعداداتك الذكية.
            </p>
          </div>
        </div>

        {isProfileComplete && !isEditingProfile ? (
          <SmartProfileView onEdit={() => setIsEditingProfile(true)} />
        ) : (
          <div>
            {isProfileComplete && (
              <div className="mb-4 flex justify-end">
                <Button
                  variant="ghost"
                  onClick={() => setIsEditingProfile(false)}
                >
                  إلغاء التعديل
                </Button>
              </div>
            )}
            <SmartProfileSettings />
          </div>
        )}

        <Card className="border-slate-200">
          <CardHeader className="py-4 px-6 border-b bg-slate-50/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <BellRing className="w-5 h-5 text-indigo-500" />
              إعدادات الإشعارات
            </CardTitle>
            <CardDescription>
              فعل الإشعارات لتتلقى تنبيهات هامة من النظام على هاتفك.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-slate-800">
                إشعارات المتصفح والموبايل
              </p>
              <p className="text-sm text-slate-500 max-w-sm">
                سيتم إرسال الإشعارات إلى هذا الجهاز. تأكد من إعطاء الصلاحية عند
                الطلب.
              </p>
            </div>
            {!isSupported ? (
              <Button variant="outline" disabled>
                غير مدعوم في متصفحك
              </Button>
            ) : isSubscribed ? (
              <Button
                variant="secondary"
                className="gap-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border-emerald-200 cursor-default"
              >
                <Bell className="w-4 h-4" />
                مفعلة مسبقاً
              </Button>
            ) : (
              <Button
                onClick={subscribeToPush}
                className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <BellRing className="w-4 h-4" />
                تفعيل الإشعارات
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
