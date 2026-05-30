import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token");
    const error = searchParams.get("error");

    if (error) {
      toast.error("فشل تسجيل الدخول. جرب تاني.");
      navigate("/login");
      return;
    }

    if (token) {
      // Token is already set in cookie by the server
      toast.success("تم تسجيل الدخول بنجاح!");
      navigate("/dashboard");
    } else {
      toast.error("مفيش توكن. جرب تاني.");
      navigate("/login");
    }
  }, [searchParams, navigate]);

  return (
    <div
      className="flex flex-col items-center justify-center h-screen"
      dir="rtl"
    >
      <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mb-4" />
      <p className="text-muted-foreground">جاري تسجيل الدخول...</p>
    </div>
  );
}
