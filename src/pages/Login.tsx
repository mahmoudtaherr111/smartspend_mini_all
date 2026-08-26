import { useState, useEffect } from "react";
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
  CheckCircle2,
  MessageCircle,
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

  // Verification state
  const [verificationCode, setVerificationCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes in seconds

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
      try {
        localStorage.setItem("smartspend_has_passkey", "1");
      } catch (e) {}
      toast.success("تم تسجيل الدخول بنجاح! 🎉");
      window.location.href = "/dashboard";
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const { data: verificationSettings } = trpc.localAuth.getVerificationSettings.useQuery();
  const isWhatsAppVerificationEnabled = Boolean(verificationSettings?.enabled);

  const generateCodeMutation = trpc.localAuth.generateVerificationCode.useMutation({
    onSuccess: () => {
      setIsVerifying(true);
      setTimeLeft(600);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // Removed checkVerificationQuery (Polling replaced with SSE)

  useEffect(() => {
    if (isVerifying && timeLeft > 0) {
      const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0 && isVerifying) {
      setIsVerifying(false);
      setVerificationCode("");
      toast.error("انتهى وقت التوثيق، برجاء المحاولة مرة أخرى");
    }
  }, [isVerifying, timeLeft]);

  useEffect(() => {
    if (!isVerifying || !regPhone || !isWhatsAppVerificationEnabled) return;

    // Open zero-polling, instantaneous SSE connection
    const eventSource = new EventSource(`/api/sse/otp?phone=${regPhone}`);

    eventSource.onmessage = (event) => {
      if (event.data === "ping") return; // Keep-alive

      try {
        const data = JSON.parse(event.data);
        
        if (data.status === "verified") {
          toast.success("تم توثيق الرقم بنجاح! جاري إنشاء الحساب...");
          setIsVerifying(false);
          eventSource.close();
          
          // Proceed with actual registration
          registerMutation.mutate({
            name: regName,
            phone: regPhone,
            email: regEmail || undefined,
            password: regPassword,
            referralCode: regReferral || undefined,
          });
        } else if (data.status === "fraud") {
          // The user tried to use a different WhatsApp number!
          setIsVerifying(false);
          setVerificationCode("");
          eventSource.close();
          toast.error(
            `رسالة أمان: رقم الواتساب غير مطابق! حاولت التوثيق من الرقم ${data.actual} بينما الرقم المسجل هو ${data.expected}`
          );
        }
      } catch (err) {
        console.error("SSE Parse Error", err);
      }
    };

    eventSource.onerror = () => {
      // Reconnection is handled automatically by EventSource, but we can log it
      console.log("SSE Connection lost, reconnecting...");
    };

    return () => {
      eventSource.close();
    };
  }, [isVerifying, regPhone]);

  const { data: googleUrl } = trpc.auth.googleUrl.useQuery();
  const { data: botPhoneNumber } = trpc.localAuth.getBotPhoneNumber.useQuery();

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

  const [hasAttemptedAutoLogin, setHasAttemptedAutoLogin] = useState(false);

  // Auto-trigger biometric quick login if passkey is registered
  useEffect(() => {
    if (hasAttemptedAutoLogin || activeTab !== "login") return;

    let hasPasskey = false;
    try {
      hasPasskey = localStorage.getItem("smartspend_has_passkey") === "1";
    } catch (e) {}

    if (hasPasskey) {
      setHasAttemptedAutoLogin(true);
      const timer = setTimeout(() => {
        handlePasskeyLogin();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [activeTab, hasAttemptedAutoLogin]);

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

    if (isWhatsAppVerificationEnabled) {
      // Start verification process instead of direct registration
      generateCodeMutation.mutate({ phone: regPhone });
    } else {
      // Register directly if OTP is disabled
      registerMutation.mutate({
        name: regName,
        phone: regPhone,
        email: regEmail || undefined,
        password: regPassword,
        referralCode: regReferral || undefined,
      });
    }
  };

  return (
    <div className="min-h-full min-h-screen-safe flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-emerald-50 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950 p-4 pt-safe pb-safe">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -end-40 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -start-40 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl" />
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
              <Loader2 className="w-5 h-5 me-2 animate-spin" />
            ) : (
              <Fingerprint className="w-5 h-5 me-2" />
            )}
            <span>الدخول السريع (بالبصمة / Passkey)</span>
          </Button>

          {googleUrl ? (
            <Button
              onClick={() => googleUrl && (window.location.href = googleUrl)}
              className="w-full h-12 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300 group mt-3"
            >
              <Chrome className="w-5 h-5 me-2 text-red-500 group-hover:scale-110 transition-transform" />
              <span>تسجيل الدخول بـ Google</span>
            </Button>
          ) : null}

          <div className="relative">
            <Separator />
            <span className="absolute start-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-900 px-3 text-xs text-muted-foreground">
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
                    className="h-11 text-start"
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
              {isVerifying ? (
                <div className="space-y-6 text-center py-4 animate-in fade-in zoom-in duration-300">
                  <div className="mx-auto w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-full flex items-center justify-center mb-4 shadow-inner">
                    <MessageCircle className="w-8 h-8" />
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white">
                      توثيق رقم التليفون
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      علشان نتأكد إن الرقم ده بتاعك، دوس على الزرار اللي تحت عشان تبعت كود التفعيل للبوت بتاعنا على الواتساب.
                    </p>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                    <p className="text-sm font-medium mb-2 text-slate-600 dark:text-slate-300">
                      كود التفعيل الخاص بك:
                    </p>
                    <p className="text-2xl font-black tracking-widest text-emerald-600 dark:text-emerald-400 font-mono bg-white dark:bg-slate-900 py-3 rounded-lg shadow-sm">
                      {verificationCode}
                    </p>
                  </div>

                  <Button
                    onClick={() => {
                      if (!botPhoneNumber || botPhoneNumber === "201000000000") {
                        toast.error("البوت غير متصل حالياً، يرجى تشغيله من لوحة التحكم أولاً");
                        return;
                      }
                      const text = encodeURIComponent(`تفعيل حسابي: ${verificationCode}`);
                      window.open(`https://wa.me/${botPhoneNumber}?text=${text}`, "_blank");
                    }}
                    className="w-full h-14 text-lg bg-[#25D366] hover:bg-[#128C7E] text-white shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 rounded-xl"
                  >
                    <MessageCircle className="w-6 h-6 me-3" />
                    إرسال الكود عبر واتساب
                  </Button>

                  <div className="flex flex-col items-center justify-center gap-3 mt-6">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2 rounded-full text-sm font-medium">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      في انتظار استلام رسالتك...
                    </div>
                    
                    <div className="text-xs font-mono font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-md">
                      ينتهي الكود خلال: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, "0")}
                    </div>
                  </div>

                  <div className="flex gap-2 w-full mt-4">
                    <Button 
                      variant="outline"
                      className="flex-1 text-xs text-slate-500 font-bold"
                      onClick={() => {
                        setIsVerifying(false);
                        setVerificationCode("");
                        toast.success("تم التخطي. يرجى توثيق رقمك لاحقاً للاستفادة الكاملة.");
                        registerMutation.mutate({
                          name: regName,
                          phone: regPhone,
                          email: regEmail || undefined,
                          password: regPassword,
                          referralCode: regReferral || undefined,
                        });
                      }}
                    >
                      تخطي الآن (التحقق لاحقاً)
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="flex-1 text-xs text-muted-foreground"
                      onClick={() => {
                        setIsVerifying(false);
                        setVerificationCode("");
                      }}
                    >
                      إلغاء وتعديل البيانات
                    </Button>
                  </div>
                </div>
              ) : (
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
                    className="h-11 text-start"
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
                    className="h-11 text-start"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg hover:shadow-xl transition-all duration-300"
                  disabled={generateCodeMutation.isPending || registerMutation.isPending}
                >
                  {generateCodeMutation.isPending
                    ? "جاري التحضير..."
                    : "إنشاء حساب"}
                </Button>
              </form>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
