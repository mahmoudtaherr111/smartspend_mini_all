import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { startRegistration } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Fingerprint, CheckCircle2, Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function PasskeySettings() {
  const [isRegistering, setIsRegistering] = useState(false);
  const utils = trpc.useUtils();
  const { data: passkeyInfo, isLoading } = trpc.webauthn.checkHasPasskey.useQuery();
  const hasPasskey = !!passkeyInfo?.hasPasskey;

  const generateOptionsMutation =
    trpc.webauthn.generateRegistrationOptions.useMutation();
  const verifyRegistrationMutation =
    trpc.webauthn.verifyRegistration.useMutation();

  const handleRegisterPasskey = async () => {
    try {
      setIsRegistering(true);

      // 1. Get options from server
      const options = await generateOptionsMutation.mutateAsync();

      // 2. Start biometric prompt in browser
      let attResp;
      try {
        attResp = await startRegistration({ optionsJSON: options });
      } catch (error: any) {
        if (error.name === "InvalidStateError") {
          toast.error("البصمة دي متسجلة قبل كده");
        } else {
          toast.error("فشل تسجيل البصمة. تأكد من تفعيل البصمة في جهازك.");
        }
        return;
      }

      // 3. Send response to server for verification
      await verifyRegistrationMutation.mutateAsync({ response: attResp });

      try {
        localStorage.setItem("smartspend_has_passkey", "1");
      } catch (e) {
        console.error("Failed to write has_passkey to localStorage", e);
      }
      utils.webauthn.checkHasPasskey.invalidate();
      toast.success("تم تفعيل الدخول بالبصمة بنجاح! 🎉");
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "حدث خطأ غير متوقع");
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900/50 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 relative overflow-hidden group">
      {/* Background Decor */}
      <div className="absolute top-0 end-0 p-8 -mt-8 -me-8 opacity-5">
        <Fingerprint className="w-48 h-48 text-indigo-600" />
      </div>

      <div className="flex gap-4 relative z-10">
        <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center flex-shrink-0 text-indigo-600 dark:text-indigo-400">
          <Fingerprint className="w-6 h-6" />
        </div>

        <div className="flex-1 space-y-1" dir="rtl">
          <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
            الدخول السريع (بالبصمة / Passkey)
            <Shield className="w-4 h-4 text-emerald-500" />
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            ادخل لحسابك بطريقة أسرع وآمنة جداً باستخدام بصمة صباعك أو بصمة الوجه
            (Face ID) من غير ما تحتاج تفتكر كلمة السر.
          </p>

          <div className="pt-4">
            {hasPasskey ? (
              <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2.5 rounded-xl border border-emerald-100 dark:border-emerald-800/50">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-bold text-sm">
                  البصمة مفعلة على هذا الجهاز
                </span>
              </div>
            ) : (
              <Button
                onClick={handleRegisterPasskey}
                disabled={isRegistering}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-600/20 px-6 gap-2"
              >
                {isRegistering ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Fingerprint className="w-4 h-4" />
                )}
                {isRegistering
                  ? "جاري تفعيل البصمة..."
                  : "تفعيل الدخول بالبصمة"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
