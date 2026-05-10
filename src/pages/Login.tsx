import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Chrome, LogIn, UserPlus, Phone, Lock, User, Mail } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const [activeTab, setActiveTab] = useState("login");

  // Login state
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register state
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regReferral, setRegReferral] = useState("");

  const loginMutation = trpc.localAuth.login.useMutation({
    onSuccess: (data) => {
      localStorage.setItem("local_auth_token", data.token);
      toast.success("تم تسجيل الدخول بنجاح! 🎉");
      window.location.href = "/";
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const registerMutation = trpc.localAuth.register.useMutation({
    onSuccess: (data) => {
      localStorage.setItem("local_auth_token", data.token);
      toast.success("تم إنشاء الحساب بنجاح! 🎉");
      window.location.href = "/";
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const { data: googleUrl } = trpc.auth.googleUrl.useQuery();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginPhone || !loginPassword) {
      toast.error("لازم تملي كل الحقول");
      return;
    }
    loginMutation.mutate({ phone: loginPhone, password: loginPassword });
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName || !regPhone || !regPassword) {
      toast.error("الاسم ورقم التليفون والباسورد مطلوبين");
      return;
    }
    registerMutation.mutate({
      name: regName,
      phone: regPhone,
      email: regEmail || undefined,
      password: regPassword,
      referralCode: regReferral || undefined,
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-emerald-50 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950 p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl" />
      </div>

      <Card className="w-full max-w-md relative z-10 shadow-2xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
        <CardHeader className="text-center space-y-3 pb-6">
          <div className="mx-auto w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg transform hover:scale-105 transition-all duration-300 hover:rotate-3">
            <span className="text-white text-3xl font-bold">SS</span>
          </div>
          <div>
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
              SmartSpend AI
            </CardTitle>
            <CardDescription className="text-sm mt-1">
              مساعدك المالي الذكي - حلل مصاريفك بالعامية المصرية
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Google OAuth (hidden when not configured) */}
          {googleUrl ? (
            <Button
              onClick={() => googleUrl && (window.location.href = googleUrl)}
              className="w-full h-12 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300 group"
            >
              <Chrome className="w-5 h-5 mr-2 text-red-500 group-hover:scale-110 transition-transform" />
              <span>تسجيل الدخول بـ Google</span>
            </Button>
          ) : null}

          <div className="relative">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-900 px-3 text-xs text-muted-foreground">
              أو استخدم رقم التليفون
            </span>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-11">
              <TabsTrigger value="login" className="flex items-center gap-2 text-sm">
                <LogIn className="w-4 h-4" /> دخول
              </TabsTrigger>
              <TabsTrigger value="register" className="flex items-center gap-2 text-sm">
                <UserPlus className="w-4 h-4" /> حساب جديد
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="space-y-4 mt-5">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-emerald-500" />
                    رقم التليفون
                  </Label>
                  <Input
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value)}
                    placeholder="01xxxxxxxxx"
                    dir="ltr"
                    className="h-11 text-left"
                    maxLength={11}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm">
                    <Lock className="w-4 h-4 text-emerald-500" />
                    الباسورد
                  </Label>
                  <Input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••"
                    className="h-11"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg hover:shadow-xl transition-all duration-300"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? "جاري الدخول..." : "دخول"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register" className="space-y-4 mt-5">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm">
                    <User className="w-4 h-4 text-emerald-500" />
                    الاسم الكامل *
                  </Label>
                  <Input
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="مثال: أحمد محمد"
                    className="h-11"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-emerald-500" />
                    رقم التليفون *
                  </Label>
                  <Input
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="01xxxxxxxxx"
                    dir="ltr"
                    className="h-11 text-left"
                    maxLength={11}
                    required
                  />
                  <p className="text-xs text-muted-foreground">لازم يبدأ بـ 010 أو 011 أو 012 أو 015</p>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-emerald-500" />
                    الإيميل (اختياري)
                  </Label>
                  <Input
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="example@email.com"
                    type="email"
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm">
                    <Lock className="w-4 h-4 text-emerald-500" />
                    الباسورد * (6 أحرف على الأقل)
                  </Label>
                  <Input
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="••••••"
                    className="h-11"
                    required
                    minLength={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">كود الدعوة (اختياري)</Label>
                  <Input
                    value={regReferral}
                    onChange={(e) => setRegReferral(e.target.value)}
                    placeholder="SSXXXXXX"
                    dir="ltr"
                    className="h-11 text-left"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg hover:shadow-xl transition-all duration-300"
                  disabled={registerMutation.isPending}
                >
                  {registerMutation.isPending ? "جاري الإنشاء..." : "إنشاء حساب"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
