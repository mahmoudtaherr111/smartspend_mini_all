import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { SEOMeta } from "@/components/seo/SEOMeta";
import { DigitalBankingSuite } from "@/components/wallets/DigitalBankingSuite";

export default function WalletsPage() {
  const navigate = useNavigate();
  const handleBack = () => {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate("/more");
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-20 px-4" dir="rtl">
      <SEOMeta title="كروتك ومحافظك - SmartSpend" />
      <div className="pt-2">
        <button
          onClick={handleBack}
          className="tap-target active-press inline-flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200"
          aria-label="الرجوع"
        >
          <ArrowRight className="size-4" />
          <span>رجوع</span>
        </button>
      </div>
      <DigitalBankingSuite onShowSetupInstructions={() => navigate("/bank-sync")} />
    </div>
  );
}
