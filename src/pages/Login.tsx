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

/**
 * Official 4-color Google 'G' Icon Component (High-DPI SVG)
 */
function GoogleIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

export default function Login() {
  const [activeTab, setActiveTab] = useState("login");
  const { theme } = useTheme();

  // Login state
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginRetrySeconds, setLoginRetrySeconds] = useState(0);

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
      const retryAfterSeconds = err.data?.retryAfterSeconds;
      if (
        typeof retryAfterSeconds === "number" &&
        Number.isFinite(retryAfterSeconds) &&
        retryAfterSeconds > 0
      ) {
        setLoginRetrySeconds(Math.ceil(retryAfterSeconds));
      }
      toast.error(err.message);
    },
  });

  useEffect(() => {
    if (loginRetrySeconds <= 0) return;
    const timer = window.setTimeout(() => {
      setLoginRetrySeconds((current) => Math.max(0, current - 1));
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [loginRetrySeconds]);

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

  const { data: verificationSettings } =
    trpc.localAuth.getVerificationSettings.useQuery();
  const isWhatsAppVerificationEnabled = Boolean(verificationSettings?.enabled);

  const generateCodeMutation =
    trpc.localAuth.generateVerificationCode.useMutation({
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
            `رسالة أمان: رقم الواتساب غير مطابق! حاولت التوثيق من الرقم ${data.actual} بينما الرقم المسجل هو ${data.expected}`,
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
    if (loginRetrySeconds > 0) return;
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

      <Card className="w-full max-w-md relative z-10 shadow-2xl border border-slate-200/80 dark:border-slate-800 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl rounded-3xl overflow-hidden">
        <CardHeader className="text-center space-y-2.5 pb-4 pt-6">
          <div className="mx-auto h-12 sm:h-14 flex items-center justify-center transition-all duration-300">
            <img
              src={whiteModeLogo}
              alt="SmartSpend"
              className="h-full w-auto object-contain block dark:hidden drop-shadow-xs"
            />
            <img
              src={darkModeLogo}
              alt="SmartSpend"
              className="h-full w-auto object-contain hidden dark:block drop-shadow-xs"
            />
          </div>
          <div>
            <CardTitle className="text-xl sm:text-2xl font-black bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
              SmartSpend AI
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm mt-1 text-slate-500 dark:text-slate-400">
              مساعدك المالي الذكي - حلل مصاريفك بالعامية المصرية
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 px-5 sm:px-6 pb-6">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 h-11 p-1 bg-slate-100 dark:bg-slate-800/70 rounded-xl">
              <TabsTrigger
                value="login"
                className="flex items-center justify-center gap-2 text-xs sm:text-sm font-bold rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm transition-all"
              >
                <LogIn className="w-4 h-4" /> دخول
              </TabsTrigger>
              <TabsTrigger
                value="register"
                className="flex items-center justify-center gap-2 text-xs sm:text-sm font-bold rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm transition-all"
              >
                <UserPlus className="w-4 h-4" /> حساب جديد
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: LOGIN */}
            <TabsContent value="login" className="space-y-4 mt-4">
              <form onSubmit={handleLogin} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                    <Phone className="w-3.5 h-3.5 text-emerald-500" />
                    رقم التليفون
                  </Label>
                  <Input
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value)}
                    placeholder="01xxxxxxxxx"
                    dir="ltr"
                    className="h-11 text-start rounded-xl font-mono text-sm bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 focus-visible:ring-emerald-500"
                    maxLength={11}
                    autoComplete="tel"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                    <Lock className="w-3.5 h-3.5 text-emerald-500" />
                    كلمة المرور
                  </Label>
                  <Input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••"
                    className="h-11 rounded-xl bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 focus-visible:ring-emerald-500"
                    autoComplete="current-password"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg transition-all duration-200"
                  disabled={loginMutation.isPending || loginRetrySeconds > 0}
                >
                  {loginMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> جاري
                      الدخول...
                    </span>
                  ) : loginRetrySeconds > 0 ? (
                    `حاول تاني بعد ${loginRetrySeconds} ث`
                  ) : (
                    "دخول"
                  )}
                </Button>
              </form>

              {googleUrl ? (
                <div className="pt-2 space-y-2.5">
                  <div className="relative flex items-center justify-center">
                    <Separator className="bg-slate-200 dark:bg-slate-800" />
                    <span className="absolute bg-white dark:bg-slate-900 px-3 text-[11px] font-medium text-slate-400">
                      أو المتابعة عبر
                    </span>
                  </div>

                  <Button
                    type="button"
                    onClick={() =>
                      googleUrl && (window.location.href = googleUrl)
                    }
                    variant="outline"
                    className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-white hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs sm:text-sm shadow-xs hover:shadow-sm transition-all duration-200 gap-2.5"
                  >
                    <GoogleIcon className="w-4 h-4" />
                    <span>المتابعة باستخدام Google</span>
                  </Button>
                </div>
              ) : null}
            </TabsContent>

            {/* TAB 2: REGISTER */}
            <TabsContent value="register" className="space-y-4 mt-4">
              {isVerifying ? (
                <div className="space-y-5 text-center py-2 animate-in fade-in zoom-in duration-300">
                  <div className="mx-auto w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-full flex items-center justify-center mb-2 shadow-inner">
                    <MessageCircle className="w-7 h-7" />
                  </div>

                  <div className="space-y-1.5">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                      توثيق رقم التليفون
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      اضغط على الزر لإرسال كود التفعيل إلى البوت عبر واتساب
                      لإتمام التسجيل.
                    </p>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-medium mb-1.5 text-slate-600 dark:text-slate-300">
                      كود التفعيل الخاص بك:
                    </p>
                    <p className="text-2xl font-black tracking-widest text-emerald-600 dark:text-emerald-400 font-mono bg-white dark:bg-slate-900 py-2.5 rounded-lg shadow-xs">
                      {verificationCode}
                    </p>
                  </div>

                  <Button
                    onClick={() => {
                      if (
                        !botPhoneNumber ||
                        botPhoneNumber === "201000000000"
                      ) {
                        toast.error(
                          "البوت غير متصل حالياً، يرجى تشغيله من لوحة التحكم أولاً",
                        );
                        return;
                      }
                      const text = encodeURIComponent(
                        `تفعيل حسابي: ${verificationCode}`,
                      );
                      window.open(
                        `https://wa.me/${botPhoneNumber}?text=${text}`,
                        "_blank",
                      );
                    }}
                    className="w-full h-12 text-base bg-[#25D366] hover:bg-[#128C7E] text-white shadow-md hover:shadow-lg transition-all duration-200 rounded-xl font-bold"
                  >
                    <MessageCircle className="w-5 h-5 me-2" />
                    إرسال الكود عبر واتساب
                  </Button>

                  <div className="flex flex-col items-center justify-center gap-2 mt-4">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-3.5 py-1.5 rounded-full text-xs font-medium">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      في انتظار استلام رسالتك...
                    </div>

                    <div className="text-[11px] font-mono font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-md">
                      ينتهي الكود خلال: {Math.floor(timeLeft / 60)}:
                      {(timeLeft % 60).toString().padStart(2, "0")}
                    </div>
                  </div>

                  <div className="flex gap-2 w-full mt-3">
                    <Button
                      variant="outline"
                      className="flex-1 text-xs text-slate-500 font-bold h-9 rounded-xl"
                      onClick={() => {
                        setIsVerifying(false);
                        setVerificationCode("");
                        toast.success(
                          "تم التخطي. يرجى توثيق رقمك لاحقاً للاستفادة الكاملة.",
                        );
                        registerMutation.mutate({
                          name: regName,
                          phone: regPhone,
                          email: regEmail || undefined,
                          password: regPassword,
                          referralCode: regReferral || undefined,
                        });
                      }}
                    >
                      تخطي الآن
                    </Button>
                    <Button
                      variant="ghost"
                      className="flex-1 text-xs text-muted-foreground h-9 rounded-xl"
                      onClick={() => {
                        setIsVerifying(false);
                        setVerificationCode("");
                      }}
                    >
                      إلغاء وتعديل
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Official Google 1-Click Fast Registration */}
                  {googleUrl ? (
                    <div className="space-y-2">
                      <Button
                        type="button"
                        onClick={() =>
                          googleUrl && (window.location.href = googleUrl)
                        }
                        className="w-full h-12 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-800 dark:text-white font-bold text-xs sm:text-sm shadow-xs hover:shadow-sm transition-all duration-200 gap-2.5 group"
                      >
                        <GoogleIcon className="w-5 h-5 transition-transform duration-200 group-hover:scale-105" />
                        <span>إنشاء حساب سريع بـ Google</span>
                      </Button>
                      <p className="text-[11px] text-center text-slate-400 font-medium">
                        بدون كلمة سر • خطوة واحدة فورية
                      </p>

                      <div className="relative flex items-center justify-center pt-2 pb-1">
                        <Separator className="bg-slate-200 dark:bg-slate-800" />
                        <span className="absolute bg-white dark:bg-slate-900 px-3 text-[11px] font-medium text-slate-400">
                          أو التسجيل برقم التليفون
                        </span>
                      </div>
                    </div>
                  ) : null}

                  <form onSubmit={handleRegister} className="space-y-3">
                    <div className="space-y-1">
                      <Label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                        <User className="w-3.5 h-3.5 text-emerald-500" />
                        الاسم الكامل *
                      </Label>
                      <Input
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        placeholder="مثال: أحمد محمد"
                        className="h-10 rounded-xl bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 focus-visible:ring-emerald-500 text-sm"
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                        <Phone className="w-3.5 h-3.5 text-emerald-500" />
                        رقم التليفون *
                      </Label>
                      <Input
                        value={regPhone}
                        onChange={(e) => setRegPhone(e.target.value)}
                        placeholder="01xxxxxxxxx"
                        dir="ltr"
                        className="h-10 text-start rounded-xl font-mono text-sm bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 focus-visible:ring-emerald-500"
                        maxLength={11}
                        required
                      />
                      <p className="text-[10px] text-muted-foreground">
                        يبدأ بـ 010 أو 011 أو 012 أو 015
                      </p>
                    </div>

                    <div className="space-y-1">
                      <Label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                        <Mail className="w-3.5 h-3.5 text-emerald-500" />
                        الإيميل (اختياري)
                      </Label>
                      <Input
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="example@email.com"
                        type="email"
                        dir="ltr"
                        className="h-10 text-start rounded-xl bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 focus-visible:ring-emerald-500 text-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                        <Lock className="w-3.5 h-3.5 text-emerald-500" />
                        كلمة المرور * (6 أحرف على الأقل)
                      </Label>
                      <Input
                        type="password"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="••••••"
                        className="h-10 rounded-xl bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 focus-visible:ring-emerald-500 text-sm"
                        required
                        minLength={6}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        كود الدعوة (اختياري)
                      </Label>
                      <Input
                        value={regReferral}
                        onChange={(e) => setRegReferral(e.target.value)}
                        placeholder="SSXXXXXX"
                        dir="ltr"
                        className="h-10 text-start rounded-xl font-mono bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 focus-visible:ring-emerald-500 text-sm"
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-11 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg transition-all duration-200 mt-2"
                      disabled={
                        generateCodeMutation.isPending ||
                        registerMutation.isPending
                      }
                    >
                      {generateCodeMutation.isPending ||
                      registerMutation.isPending
                        ? "جاري التحضير..."
                        : "إنشاء حساب"}
                    </Button>
                  </form>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
