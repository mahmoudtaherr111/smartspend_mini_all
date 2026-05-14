import { useState, useEffect } from "react";
import { trpc } from "../providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, X } from "lucide-react";

export function OnboardingCard() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const [income, setIncome] = useState("");
  const [goal, setGoal] = useState("");

  const profile = trpc.profile.getMyProfile.useQuery(undefined, { retry: false });
  const saveProfile = trpc.profile.updateProfile.useMutation({
    onSuccess: () => setShow(false),
  });

  useEffect(() => {
    if (profile.data && !profile.data.profileCompleted) {
      // Show after 2 seconds
      const timer = setTimeout(() => setShow(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [profile.data]);

  if (!show || profile.data?.profileCompleted) return null;

  const goals = [
    { key: "saving", label: "💰 توفير فلوس" },
    { key: "debt_payoff", label: "💳 سداد ديون" },
    { key: "investing", label: "📈 استثمار" },
    { key: "budgeting", label: "📊 ضبط الميزانية" },
  ];

  const handleSubmit = () => {
    saveProfile.mutate({
      monthlyIncome: income ? parseFloat(income) : undefined,
      financialGoal: goal || undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md relative animate-in fade-in zoom-in-95 duration-300">
        <Button 
          variant="ghost" size="icon" 
          className="absolute top-2 left-2" 
          onClick={() => setShow(false)}
        >
          <X className="w-4 h-4" />
        </Button>
        <CardContent className="p-6 text-center" dir="rtl">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-lg font-bold mb-1">عشان نساعدك أكتر! ✨</h3>
          <p className="text-sm text-muted-foreground mb-6">
            كام سؤال بسيط عشان المساعد المالي يديك نصائح أقوى ومخصصة ليك
          </p>

          {step === 0 && (
            <div className="space-y-4">
              <div className="text-right">
                <label className="text-sm font-medium">متوسط دخلك الشهري كام تقريباً؟</label>
                <Input 
                  type="number" 
                  placeholder="مثال: 5000" 
                  value={income} 
                  onChange={(e) => setIncome(e.target.value)}
                  className="mt-2"
                  dir="ltr"
                />
              </div>
              <Button className="w-full" onClick={() => setStep(1)}>
                التالي
              </Button>
              <button className="text-xs text-muted-foreground hover:underline" onClick={() => setShow(false)}>
                مش دلوقتي
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-right mb-3">إيه هدفك المالي الأساسي؟</p>
              <div className="grid grid-cols-2 gap-2">
                {goals.map((g) => (
                  <Button
                    key={g.key}
                    variant={goal === g.key ? "default" : "outline"}
                    className="h-auto py-3 text-sm"
                    onClick={() => setGoal(g.key)}
                  >
                    {g.label}
                  </Button>
                ))}
              </div>
              <Button 
                className="w-full mt-4" 
                onClick={handleSubmit}
                disabled={saveProfile.isPending}
              >
                {saveProfile.isPending ? "جاري الحفظ..." : "تم! 🎉"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
