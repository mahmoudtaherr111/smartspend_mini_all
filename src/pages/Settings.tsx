import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { trpc } from "../providers/trpc";
import { SEOMeta } from "../components/seo/SEOMeta";
import { User } from "lucide-react";
import { SmartProfileSettings } from "@/components/profile/SmartProfileSettings";
import { SmartProfileView } from "@/components/profile/SmartProfileView";
import { Button } from "@/components/ui/button";

export default function Settings() {
  const { user } = useAuth();
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const profileQuery = trpc.profile.getSmartProfile.useQuery();
  const isProfileComplete = profileQuery.data?.profileCompleted;

  const avatar = user?.avatar || "";

  return (
    <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
      <SEOMeta path="/settings" title="إدارة الملف الشخصي - SmartSpend AI" />
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
            <h1 className="text-3xl font-bold">إدارة الملف الشخصي</h1>
            <p className="text-muted-foreground">تعديل بيانات حسابك الشخصي وإعداداتك الذكية.</p>
          </div>
        </div>

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
