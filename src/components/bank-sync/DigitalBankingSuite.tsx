import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import {
  CreditCard,
  Plus,
  Trash2,
  TrendingUp,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  Smartphone,
  Info,
  DollarSign,
  History,
  AlertCircle,
  PiggyBank,
  CheckCircle,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface SuiteProps {
  onShowSetupInstructions: () => void;
}

export function DigitalBankingSuite({ onShowSetupInstructions }: SuiteProps) {
  const utils = trpc.useUtils();
  const [selectedWalletId, setSelectedWalletId] = useState<number | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<number | null>(null);

  // Form states
  const [newName, setNewName] = useState("");
  const [newProvider, setNewProvider] = useState("Visa");
  const [newLastDigits, setNewLastDigits] = useState("");
  const [newBalance, setNewBalance] = useState("0.00");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Queries
  const { data: wallets = [], isLoading: isLoadingWallets } =
    trpc.wallet.getWallets.useQuery();
  const { data: transactions = [], isLoading: isLoadingTx } =
    trpc.wallet.getWalletTransactions.useQuery(
      { walletId: selectedWalletId || 0 },
      { enabled: !!selectedWalletId },
    );

  // Mutations
  const createWalletMutation = trpc.wallet.createWallet.useMutation({
    onSuccess: () => {
      toast.success("🎉 تم إضافة البطاقة بنجاح!");
      utils.wallet.getWallets.invalidate();
      setIsAddModalOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.message || "حدث خطأ أثناء إضافة البطاقة");
    },
  });

  const deleteWalletMutation = trpc.wallet.deleteWallet.useMutation({
    onSuccess: () => {
      toast.success("✅ تم حذف البطاقة بنجاح");
      utils.wallet.getWallets.invalidate();
      setIsDeletingId(null);
      if (selectedWalletId === isDeletingId) {
        setSelectedWalletId(null);
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "حدث خطأ أثناء حذف البطاقة");
      setIsDeletingId(null);
    },
  });

  const resetForm = () => {
    setNewName("");
    setNewProvider("Visa");
    setNewLastDigits("");
    setNewBalance("0.00");
  };

  // Determine provider styles (gradients & colors)
  const getProviderConfig = (provider: string) => {
    switch (provider) {
      case "VodafoneCash":
        return {
          gradient: "from-red-600 via-rose-700 to-red-900",
          logoText: "vodafone cash",
          logoColor: "text-white",
          logoBg: "bg-red-600",
          displayName: "فودافون كاش",
          glow: "shadow-red-600/40",
        };
      case "InstaPay":
        return {
          gradient: "from-fuchsia-600 via-purple-700 to-indigo-900",
          logoText: "instaPay",
          logoColor: "text-pink-300 font-extrabold italic",
          logoBg: "bg-purple-600",
          displayName: "إنستا باي",
          glow: "shadow-purple-600/40",
        };
      case "CIB":
        return {
          gradient: "from-blue-900 via-blue-800 to-indigo-950",
          logoText: "CIB",
          logoColor: "text-amber-400 font-extrabold",
          logoBg: "bg-blue-900",
          displayName: "البنك التجاري الدولي CIB",
          glow: "shadow-blue-900/40",
        };
      case "NBE":
        return {
          gradient: "from-emerald-700 via-teal-800 to-slate-900",
          logoText: "NBE",
          logoColor: "text-amber-300 font-bold",
          logoBg: "bg-emerald-700",
          displayName: "البنك الأهلي المصري",
          glow: "shadow-emerald-700/40",
        };
      case "BanqueMisr":
        return {
          gradient: "from-amber-600 via-red-900 to-stone-900",
          logoText: "BM",
          logoColor: "text-yellow-400 font-serif font-extrabold",
          logoBg: "bg-amber-700",
          displayName: "بنك مصر",
          glow: "shadow-amber-700/40",
        };
      case "QNB":
        return {
          gradient: "from-teal-800 via-cyan-900 to-indigo-950",
          logoText: "QNB",
          logoColor: "text-white font-black",
          logoBg: "bg-teal-900",
          displayName: "QNB الأهلي",
          glow: "shadow-teal-800/40",
        };
      case "Fawry":
        return {
          gradient: "from-yellow-500 via-amber-600 to-orange-800",
          logoText: "fawry",
          logoColor: "text-blue-950 font-bold",
          logoBg: "bg-yellow-400",
          displayName: "فوري",
          glow: "shadow-yellow-500/40",
        };
      case "OrangeMoney":
        return {
          gradient: "from-orange-500 via-orange-600 to-red-800",
          logoText: "orange",
          logoColor: "text-white font-extrabold",
          logoBg: "bg-orange-500",
          displayName: "أورنج كاش",
          glow: "shadow-orange-500/40",
        };
      case "EtisalatCash":
        return {
          gradient: "from-lime-600 via-green-800 to-slate-950",
          logoText: "e& cash",
          logoColor: "text-white font-black",
          logoBg: "bg-lime-500",
          displayName: "اتصالات كاش",
          glow: "shadow-lime-600/40",
        };
      default:
        return {
          gradient: "from-slate-800 via-slate-700 to-slate-900",
          logoText: "VISA",
          logoColor: "text-white tracking-widest font-black italic",
          logoBg: "bg-slate-700",
          displayName: "فيزا / كارت بنكي",
          glow: "shadow-slate-700/40",
        };
    }
  };

  // Add Card Submission
  const handleAddWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      toast.error("يرجى إدخال اسم المحفظة/الكارت");
      return;
    }
    if (newLastDigits && newLastDigits.length !== 4) {
      toast.error("يرجى إدخال 4 أرقام بالضبط");
      return;
    }

    setIsSubmitting(true);
    try {
      await createWalletMutation.mutateAsync({
        name: newName,
        provider: newProvider,
        lastFourDigits: newLastDigits || undefined,
        balance: newBalance || "0.00",
      });
    } catch {
      // Handled by onError
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Card Action
  const handleDeleteWallet = async (id: number) => {
    setIsDeletingId(id);
    try {
      await deleteWalletMutation.mutateAsync({ id });
    } catch {
      // Handled by onError
    }
  };

  // Select card
  const handleSelectWallet = (id: number) => {
    setSelectedWalletId(id === selectedWalletId ? null : id);
  };

  // 3D Tilt Effect Handlers
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const box = card.getBoundingClientRect();
    const x = e.clientX - box.left - box.width / 2;
    const y = e.clientY - box.top - box.height / 2;
    // Limit rotation to maximum 12 degrees
    const rY = (x / (box.width / 2)) * 12;
    const rX = -(y / (box.height / 2)) * 12;
    card.style.transform = `perspective(1000px) rotateY(${rY}deg) rotateX(${rX}deg) scale3d(1.02, 1.02, 1.02)`;

    // Shiny overlay position
    const reflection = card.querySelector(".card-shine") as HTMLDivElement;
    if (reflection) {
      const percentageX = ((e.clientX - box.left) / box.width) * 100;
      const percentageY = ((e.clientY - box.top) / box.height) * 100;
      reflection.style.background = `radial-gradient(circle at ${percentageX}% ${percentageY}%, rgba(255, 255, 255, 0.25) 0%, transparent 60%)`;
    }
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    card.style.transform =
      "perspective(1000px) rotateY(0deg) rotateX(0deg) scale3d(1, 1, 1)";
    const reflection = card.querySelector(".card-shine") as HTMLDivElement;
    if (reflection) {
      reflection.style.background = "transparent";
    }
  };

  // Calculate card totals based on fetched transactions
  const getCardTotals = () => {
    let totalIn = 0;
    let totalOut = 0;
    transactions.forEach((tx: any) => {
      const amount = parseFloat(tx.amount);
      if (tx.type === "income") {
        totalIn += amount;
      } else {
        totalOut += amount;
      }
    });
    return { totalIn, totalOut };
  };

  const { totalIn, totalOut } = getCardTotals();
  const selectedWallet = wallets.find((w: any) => w.id === selectedWalletId);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Head Panel */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 rounded-3xl p-6 sm:p-8 text-white shadow-2xl relative overflow-hidden border border-white/10">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500 opacity-5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-500 opacity-5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4 pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-emerald-500/20 backdrop-blur-sm px-4 py-1.5 rounded-full text-emerald-300 text-xs font-bold border border-emerald-500/30">
              <CheckCircle className="w-3.5 h-3.5" />
              الربط البنكي التلقائي نشط ومكتمل
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              محفظتك الرقمية الذكية 💳
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed max-w-xl">
              تظهر هنا جميع الكروت والمحافظ التي تم تفعيلها. أي إشعار بنكي أو
              رسالة سحب/إيداع سيتم ربطها تلقائياً بالبطاقة المناسبة لتحديث
              الرصيد فورياً.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 shrink-0">
            <button
              onClick={onShowSetupInstructions}
              className="bg-white/10 hover:bg-white/15 text-white border border-white/20 transition-all rounded-2xl px-4 py-2.5 text-xs font-bold flex items-center gap-2 btn-press"
            >
              <Smartphone className="w-4 h-4 text-emerald-400" />
              تعديل إعدادات الربط / الجهاز
            </button>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-xs px-5 py-2.5 rounded-2xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 btn-press"
            >
              <Plus className="w-4 h-4" />
              إضافة كارت / محفظة
            </button>
          </div>
        </div>
      </div>

      {/* Wallets & Cards Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-extrabold text-slate-800 dark:text-white flex items-center gap-2 px-1">
          <CreditCard className="w-5 h-5 text-emerald-500" />
          البطاقات والمحافظ النشطة
          <span className="text-xs font-normal text-muted-foreground">
            ({wallets.length} كروت)
          </span>
        </h2>

        {isLoadingWallets ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-52 rounded-3xl bg-slate-100 dark:bg-slate-800/50 animate-pulse relative overflow-hidden"
              >
                <div className="absolute inset-0 shimmer" />
              </div>
            ))}
          </div>
        ) : wallets.length === 0 ? (
          <div className="bg-slate-50 dark:bg-slate-900/50 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-10 text-center space-y-4">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto shadow-inner text-slate-400">
              <CreditCard className="w-8 h-8" />
            </div>
            <div className="max-w-sm mx-auto space-y-1">
              <h3 className="font-extrabold text-slate-800 dark:text-white">
                لا توجد بطاقات بنكية بعد
              </h3>
              <p className="text-xs text-muted-foreground">
                قم بإضافة كارت بنكي (مثل فيزا CIB أو محفظة فودافون كاش) لعرضها
                بشكل ثلاثي أبعاد ومتابعة إحصائياتها.
              </p>
            </div>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-md btn-press"
            >
              اضغط هنا لإضافة أول كارت
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {wallets.map((wallet: any) => {
              const config = getProviderConfig(wallet.provider);
              const isSelected = selectedWalletId === wallet.id;

              return (
                <div
                  key={wallet.id}
                  onClick={() => handleSelectWallet(wallet.id)}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                  className={`relative h-52 rounded-3xl bg-gradient-to-br ${config.gradient} p-6 text-white cursor-pointer shadow-xl transition-all duration-300 transform-gpu overflow-hidden flex flex-col justify-between select-none border border-white/10 ${config.glow} hover:shadow-2xl ${
                    isSelected ? "ring-4 ring-emerald-500 scale-[1.03]" : ""
                  }`}
                  style={{
                    transformStyle: "preserve-3d",
                    transition:
                      "transform 0.1s ease, box-shadow 0.3s ease, ring 0.2s",
                  }}
                >
                  {/* Glass Card Shine Overlay */}
                  <div className="card-shine absolute inset-0 pointer-events-none transition-all duration-150" />

                  {/* Subtle Grid Lines for Card realism */}
                  <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none opacity-40" />

                  {/* Top Row: Provider & Chip */}
                  <div
                    className="flex justify-between items-start z-10"
                    style={{ transform: "translateZ(30px)" }}
                  >
                    <div className="flex flex-col">
                      <span className="text-[10px] text-white/60 tracking-wider uppercase">
                        الحساب الرقمي
                      </span>
                      <span className="font-extrabold text-sm tracking-wide">
                        {wallet.name}
                      </span>
                    </div>

                    {/* Chip Design */}
                    <div className="w-9 h-7 rounded-md bg-gradient-to-br from-yellow-300 via-amber-400 to-yellow-500 border border-amber-600/30 flex flex-col justify-between p-1 shadow-inner opacity-90">
                      <div className="flex justify-between w-full h-[3px] border-b border-black/10" />
                      <div className="flex justify-between w-full h-[3px] border-b border-black/10" />
                      <div className="w-full h-2 border border-black/5 rounded-sm" />
                    </div>
                  </div>

                  {/* Mid Row: Card digits */}
                  <div
                    className="z-10 text-center my-3"
                    style={{ transform: "translateZ(40px)" }}
                  >
                    <p className="font-mono text-base tracking-widest text-white/90 drop-shadow-md">
                      •••• •••• •••• {wallet.lastFourDigits || "••••"}
                    </p>
                  </div>

                  {/* Bottom Row: Balance & Brand Logo */}
                  <div
                    className="flex justify-between items-end z-10"
                    style={{ transform: "translateZ(30px)" }}
                  >
                    <div className="flex flex-col">
                      <span className="text-[9px] text-white/50 tracking-wider uppercase">
                        الرصيد الحالي
                      </span>
                      <span className="text-lg font-black tracking-tight text-white drop-shadow-md">
                        {parseFloat(wallet.balance || "0").toLocaleString(
                          "ar-EG",
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          },
                        )}{" "}
                        <span className="text-xs font-semibold text-white/80">
                          ج.م
                        </span>
                      </span>
                    </div>

                    {/* Styled Brand Logo */}
                    <div
                      className={`px-3 py-1 rounded-lg ${config.logoBg} shadow-md border border-white/10 shrink-0`}
                    >
                      <span
                        className={`text-[10px] tracking-wider ${config.logoColor}`}
                      >
                        {config.logoText}
                      </span>
                    </div>
                  </div>

                  {/* Indicator if selected */}
                  {isSelected && (
                    <div className="absolute top-3 left-3 bg-emerald-500 text-white rounded-full p-1 shadow-md z-20">
                      <CheckCircle className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Card Details: Transactions & Insights */}
      {selectedWalletId && selectedWallet ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
          {/* Card stats / Actions */}
          <div className="lg:col-span-1 space-y-6">
            {/* Quick Card Stats */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-md space-y-4">
              <h3 className="font-extrabold text-sm text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2">
                <Info className="w-4 h-4 text-emerald-500" />
                ملخص إحصائيات البطاقة
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-500/10 rounded-2xl p-3.5 border border-emerald-500/20 text-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto text-emerald-500 mb-2">
                    <ArrowDownLeft className="w-4 h-4" />
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">
                    إجمالي الإيداعات
                  </p>
                  <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-1">
                    {totalIn.toLocaleString("ar-EG")} ج.م
                  </p>
                </div>

                <div className="bg-rose-500/10 rounded-2xl p-3.5 border border-rose-500/20 text-center">
                  <div className="w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center mx-auto text-rose-500 mb-2">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">
                    إجمالي السحوبات
                  </p>
                  <p className="text-sm font-black text-rose-600 dark:text-rose-400 mt-1">
                    {totalOut.toLocaleString("ar-EG")} ج.م
                  </p>
                </div>
              </div>

              {/* Dynamic statement message */}
              <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-4 text-xs space-y-2 border border-slate-100 dark:border-slate-800/60 leading-relaxed text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-300">
                  <PiggyBank className="w-4 h-4 text-amber-500" />
                  ملاحظة المحاسب الذكي:
                </div>
                <p>
                  {totalOut > totalIn
                    ? "معدل سحبك من هذا الكارت أعلى من الإيداع المكتشف. ننصح بتقليل الاعتماد عليه وتأمين رصيد كافٍ."
                    : "رصيد الكارت في حالة صحية جيدة! الاستهلاك مساوي أو أقل من إيداعاتك المكتشفة مؤخراً."}
                </p>
              </div>
            </div>

            {/* Actions Panel */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-md space-y-4">
              <h3 className="font-extrabold text-sm text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2">
                <Info className="w-4 h-4 text-red-500" />
                خيارات وإجراءات الكارت
              </h3>

              <div className="space-y-2">
                {isDeletingId === selectedWallet.id ? (
                  <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3 rounded-2xl text-center space-y-2">
                    <p className="text-xs text-red-800 dark:text-red-300 font-extrabold">
                      هل أنت متأكد من حذف هذا الكارت؟
                    </p>
                    <p className="text-[10px] text-red-500">
                      الحذف سيلغي ربط المعاملات الخاصة بهذا الكارت لكن لن يمسح
                      المصاريف نفسها.
                    </p>
                    <div className="flex justify-center gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteWallet(selectedWallet.id)}
                        className="h-8 font-bold text-xs bg-red-600 text-white hover:bg-red-700"
                      >
                        نعم، احذف
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsDeletingId(null)}
                        className="h-8 font-bold text-xs border-slate-200 dark:border-slate-800"
                      >
                        إلغاء
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsDeletingId(selectedWallet.id)}
                    className="w-full bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/20 dark:hover:bg-red-950/40 dark:text-red-400 border border-red-200/50 dark:border-red-900/30 font-bold text-xs px-4 py-3 rounded-2xl flex items-center justify-center gap-2 transition-all btn-press"
                  >
                    <Trash2 className="w-4 h-4" />
                    حذف وإلغاء تنشيط الكارت
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Transactions List of selected Wallet */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-md p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-4">
              <h3 className="font-extrabold text-slate-800 dark:text-white flex items-center gap-2 text-base">
                <History className="w-5 h-5 text-emerald-500 animate-pulse" />
                سجل سحب وإيداع: {selectedWallet.name}
              </h3>

              <span className="text-xs bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-full font-bold">
                {transactions.length} معاملة
              </span>
            </div>

            {isLoadingTx ? (
              <div className="space-y-3 py-6">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-14 rounded-2xl bg-slate-50 dark:bg-slate-800 animate-pulse relative overflow-hidden"
                  >
                    <div className="absolute inset-0 shimmer" />
                  </div>
                ))}
              </div>
            ) : transactions.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-50 dark:bg-slate-800/80 flex items-center justify-center mx-auto shadow-inner text-slate-300">
                  <History className="w-6 h-6" />
                </div>
                <div className="max-w-xs mx-auto space-y-1">
                  <p className="font-bold text-xs text-slate-700 dark:text-slate-300">
                    لا توجد عمليات مسجلة لهذا الكارت بعد
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    سيتم عرض المعاملات فور ورودها عبر الرسائل التلقائية للهاتف،
                    أو يمكنك تسجيل مصاريف يدوية وتحديد هذا الكارت.
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/60 max-h-[450px] overflow-y-auto pr-1">
                {transactions.map((tx: any) => {
                  const isIncome = tx.type === "income";
                  const dateStr = new Date(tx.date).toLocaleDateString(
                    "ar-EG",
                    {
                      month: "long",
                      day: "numeric",
                      hour: "numeric",
                      minute: "numeric",
                    },
                  );

                  return (
                    <div
                      key={tx.id}
                      className="py-3 flex items-center justify-between gap-4 group hover:bg-slate-50 dark:hover:bg-slate-800/20 px-2 rounded-xl transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${
                            isIncome
                              ? "bg-emerald-500/10 text-emerald-500"
                              : "bg-rose-500/10 text-rose-500"
                          }`}
                        >
                          {isIncome ? (
                            <ArrowDownLeft className="w-5 h-5" />
                          ) : (
                            <ArrowUpRight className="w-5 h-5" />
                          )}
                        </div>

                        <div className="space-y-0.5">
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                            {tx.description || tx.category}
                          </p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                            {dateStr} • {tx.category}{" "}
                            {tx.subCategory ? `» ${tx.subCategory}` : ""}
                          </p>
                        </div>
                      </div>

                      <div className="text-left shrink-0">
                        <p
                          className={`text-sm font-black tracking-tight ${
                            isIncome
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {isIncome ? "+" : "-"}
                          {parseFloat(tx.amount).toLocaleString("ar-EG", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </p>
                        <p className="text-[9px] text-slate-400 uppercase tracking-widest">
                          ج.م
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Add Card Modal */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
          dir="rtl"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl space-y-4 scale-up-animation">
            {/* Modal Head */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-950 p-6 text-white flex justify-between items-center border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                  <CreditCard className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base">
                    إضافة بطاقة بنكية / محفظة جديدة
                  </h3>
                  <p className="text-white/60 text-[10px] mt-0.5">
                    ستظهر بشكل تفاعلي 3D بمجرد حفظها
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleAddWallet} className="p-6 space-y-4">
              {/* Wallet Provider */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  نوع البنك أو المحفظة
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: "Visa", name: "كارت فيزا / بنك" },
                    { val: "VodafoneCash", name: "فودافون كاش" },
                    { val: "InstaPay", name: "إنستا باي" },
                    { val: "CIB", name: "CIB البنك التجاري" },
                    { val: "NBE", name: "البنك الأهلي" },
                    { val: "BanqueMisr", name: "بنك مصر" },
                    { val: "QNB", name: "QNB الأهلي" },
                    { val: "Fawry", name: "فوري" },
                    { val: "OrangeMoney", name: "أورنج كاش" },
                    { val: "EtisalatCash", name: "اتصالات كاش" },
                  ].map((prov) => (
                    <button
                      key={prov.val}
                      type="button"
                      onClick={() => setNewProvider(prov.val)}
                      className={`p-2 text-[10px] font-bold rounded-xl border text-center transition-all ${
                        newProvider === prov.val
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-400"
                          : "bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {prov.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Wallet Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  اسم الكارت / المحفظة
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: فيزا المشتريات، محفظة خط اتصالات..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Last 4 Digits */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    آخر 4 أرقام من الكارت
                    <span className="text-[10px] font-normal text-slate-400">
                      (اختياري)
                    </span>
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="مثال: 5824"
                    value={newLastDigits}
                    onChange={(e) =>
                      setNewLastDigits(e.target.value.replace(/\D/g, ""))
                    }
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs text-center font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Initial Balance */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    الرصيد الافتتاحي الحالي
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={newBalance}
                      onChange={(e) => setNewBalance(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pr-4 pl-10 py-2.5 text-xs text-left font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                      ج.م
                    </span>
                  </div>
                </div>
              </div>

              {/* Info text */}
              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-2xl border border-blue-200/50 dark:border-blue-900/30 flex gap-2.5">
                <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-[10px] text-blue-800 dark:text-blue-300 leading-relaxed">
                  تحديد اسم أو نوع البطاقة بشكل دقيق سيساعد الذكاء الاصطناعي على
                  تصنيف رسائل الـ SMS الواردة تلقائياً وربطها بهذا الحساب فوراً
                  لتعديل الرصيد وتتبع الإحصائيات.
                </p>
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-xl font-bold text-xs h-10 border-slate-200 dark:border-slate-800"
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl font-bold text-xs h-10 bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600"
                >
                  {isSubmitting ? "جاري الحفظ..." : "حفظ وإضافة"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
