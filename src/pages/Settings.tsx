import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { trpc } from "../providers/trpc";
import { SEOMeta } from "../components/seo/SEOMeta";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { User, Phone, Save, Link as LinkIcon, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { SmartProfileSettings } from "@/components/profile/SmartProfileSettings";
import { SmartProfileView } from "@/components/profile/SmartProfileView";

export default function Settings() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatar, setAvatar] = useState("");
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const profileQuery = trpc.profile.getSmartProfile.useQuery();
  const isProfileComplete = profileQuery.data?.profileCompleted;

  const utils = trpc.useUtils();

  const updateMutation = trpc.profile.updateUserInfo.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث البيانات بنجاح!");
      utils.auth.me.invalidate();
      utils.localAuth.me.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "حدث خطأ أثناء التحديث");
    }
  });

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setPhone(user.phone || "");
      setAvatar(user.avatar || "");
    }
  }, [user]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    updateMutation.mutate({ name, phone, avatar });
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
      <SEOMeta path="/settings" title="ملف المستخدم - SmartSpend AI" />
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4 mb-2">
          {avatar ? (
             <img src={avatar} alt="Profile" className="w-16 h-16 rounded-full object-cover border-4 border-emerald-100 shadow-sm" />
          ) : (
             <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center border-4 border-emerald-100 shadow-sm">
               <User className="w-8 h-8" />
             </div>
          )}
          <div>
            <h1 className="text-3xl font-bold">ملف المستخدم</h1>
            <p className="text-muted-foreground">تعديل بيانات حسابك الشخصي وإعداداتك الذكية.</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>البيانات الشخصية</CardTitle>
            <CardDescription>قم بتحديث اسمك وصورتك الشخصية.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">الاسم</label>
                <div className="relative">
                  <User className="absolute right-3 top-2.5 h-5 w-5 text-muted-foreground" />
                  <Input 
                    placeholder="اسمك" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)}
                    className="pr-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">رابط الصورة الشخصية (اختياري)</label>
                <div className="relative">
                  <LinkIcon className="absolute right-3 top-2.5 h-5 w-5 text-muted-foreground" />
                  <Input 
                    placeholder="https://example.com/avatar.png" 
                    value={avatar} 
                    onChange={(e) => setAvatar(e.target.value)}
                    className="pr-10 text-left"
                    dir="ltr"
                  />
                </div>
                <p className="text-xs text-muted-foreground">يمكنك وضع رابط صورة أو صورة مؤقتة.</p>
              </div>

              {user?.type !== "oauth" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">رقم التليفون</label>
                  <div className="relative">
                    <Phone className="absolute right-3 top-2.5 h-5 w-5 text-muted-foreground" />
                    <Input 
                      placeholder="رقم التليفون" 
                      value={phone} 
                      onChange={(e) => setPhone(e.target.value)}
                      className="pr-10"
                      dir="ltr"
                      style={{ textAlign: "right" }}
                    />
                  </div>
                </div>
              )}

              <Button type="submit" disabled={updateMutation.isPending} className="w-full mt-4">
                {updateMutation.isPending ? "جاري الحفظ..." : (
                  <>
                    <Save className="w-4 h-4 ml-2" />
                    حفظ التعديلات
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {isProfileComplete && !isEditingProfile ? (
          <SmartProfileView onEdit={() => setIsEditingProfile(true)} />
        ) : (
          <div>
            {isProfileComplete && (
              <div className="mb-4 flex justify-end">
                <Button variant="ghost" onClick={() => setIsEditingProfile(false)}>
                  إلغاء التعديل
                </Button>
              </div>
            )}
            <SmartProfileSettings />
          </div>
        )}
      </div>
    </div>
  );
}
