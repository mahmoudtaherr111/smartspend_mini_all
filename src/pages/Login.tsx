import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Chrome,
  LogIn,
  UserPlus,
  Phone,
  Lock,
  User,
  Mail,
  Fingerprint,
  Loader2,
} from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import darkModeLogo from "../../photos/dark_mode_logo-removebg-preview.png";
import whiteModeLogo from "../../photos/white_mode_logo-removebg-preview.png";

export default function Login() {
  const [activeTab, setActiveTab] = useState("login");
  const { theme } = useTheme();

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
      window.location.href = "/dashboard";
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const registerMutation = trpc.localAuth.register.useMutation({
    onSuccess: (data) => {
      localStorage.setItem("local_auth_token", data.token);
      toast.success("تم إنشاء الحساب بنجاح! 🎉");
      window.location.href = "/dashboard";
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const authOptionsMutation =
    trpc.webauthn.generateAuthenticationOptions.useMutation();
  const verifyAuthMutation = trpc.webauthn.verifyAuthentication.useMutation({
    onSuccess: (data) => {
      localStorage.setItem("local_auth_token", data.token);
      toast.success("تم تسجيل الدخول بنجاح! 🎉");
      window.location.href = "/dashboard";
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const { data: googleUrl } = trpc.auth.googleUrl.useQuery();

  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);

  const handlePasskeyLogin = async () => {
    try {
      setIsPasskeyLoading(true);
      // 1. Get options
      const { options, sessionId } = await authOptionsMutation.mutateAsync({});

      // 2. Start browser biometric prompt
      let asseResp;
      try {
        asseResp = await startAuthentication({ optionsJSON: options });
      } catch (err: any) {
        toast.error("تم إلغاء الدخول بالبصمة");
        return;
      }

      // 3. Verify on server
      await verifyAuthMutation.mutateAsync({ response: asseResp, sessionId });
    } catch (err: any) {
      toast.error(err.message || "فشل الدخول بالبصمة");
    } finally {
      setIsPasskeyLoading(false);
    }
  };

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
          <div className="mx-auto h-[160px] flex items-center justify-center transform hover:scale-110 transition-all duration-300 mb-2">
            <img
              src={whiteModeLogo}
              alt="SmartSpend"
              className="h-full w-auto object-contain block dark:hidden drop-shadow-sm scale-125"
            />
            <img
              src={darkModeLogo}
              alt="SmartSpend"
              className="h-full w-auto object-contain hidden dark:block drop-shadow-sm scale-125"
            />
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
          {/* Passkey Login */}
          <Button
            onClick={handlePasskeyLogin}
            disabled={isPasskeyLoading}
            variant="outline"
            className="w-full h-12 bg-indigo-50/50 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 transition-all duration-300"
          >
            {isPasskeyLoading ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <Fingerprint className="w-5 h-5 mr-2" />
            )}
            <span>الدخول السريع (بالبصمة / Passkey)</span>
          </Button>

          {googleUrl ? (
            <Button
              onClick={() => googleUrl && (window.location.href = googleUrl)}
              className="w-full h-12 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300 group mt-3"
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

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 h-11">
              <TabsTrigger
                value="login"
                className="flex items-center gap-2 text-sm"
              >
                <LogIn className="w-4 h-4" /> دخول
              </TabsTrigger>
              <TabsTrigger
                value="register"
                className="flex items-center gap-2 text-sm"
              >
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
                  <p className="text-xs text-muted-foreground">
                    لازم يبدأ بـ 010 أو 011 أو 012 أو 015
                  </p>
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
                  {registerMutation.isPending
                    ? "جاري الإنشاء..."
                    : "إنشاء حساب"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
