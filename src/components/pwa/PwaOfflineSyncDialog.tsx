import { useState, useEffect } from "react";
import { Database, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface PwaOfflineSyncDialogProps {
  isOnline: boolean;
}

interface OfflineTextItem {
  id?: string;
  clientRequestId?: string;
  text: string;
  timestamp: number;
  status?: string;
}

interface OfflineManualItem {
  id?: string;
  clientRequestId?: string;
  amount: string;
  category: string;
  subCategory?: string;
  description?: string;
  timestamp: number;
  source?: string;
  businessId?: number | null;
  [key: string]: any;
}

export function PwaOfflineSyncDialog({ isOnline }: PwaOfflineSyncDialogProps) {
  const navigate = useNavigate();
  const [pendingTexts, setPendingTexts] = useState<OfflineTextItem[]>([]);
  const [pendingManual, setPendingManual] = useState<OfflineManualItem[]>([]);
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const loadQueues = () => {
    try {
      let needsSaveTexts = false;
      const rawTexts = JSON.parse(
        localStorage.getItem("smartspend_offline_texts") || "[]",
      );
      const texts: OfflineTextItem[] = Array.isArray(rawTexts)
        ? rawTexts.map((item: OfflineTextItem, idx: number) => {
            if (!item.id && !item.clientRequestId) {
              item.id = `offline_text_${item.timestamp || Date.now()}_${idx}`;
              needsSaveTexts = true;
            }
            return item;
          })
        : [];
      if (needsSaveTexts) {
        localStorage.setItem("smartspend_offline_texts", JSON.stringify(texts));
      }

      let needsSaveManual = false;
      const rawManual = JSON.parse(
        localStorage.getItem("smartspend_offline_manual") || "[]",
      );
      const manual: OfflineManualItem[] = Array.isArray(rawManual)
        ? rawManual.map((item: OfflineManualItem, idx: number) => {
            if (!item.id && !item.clientRequestId) {
              item.id = `offline_manual_${item.timestamp || Date.now()}_${idx}`;
              needsSaveManual = true;
            }
            return item;
          })
        : [];
      if (needsSaveManual) {
        localStorage.setItem(
          "smartspend_offline_manual",
          JSON.stringify(manual),
        );
      }

      setPendingTexts(texts);
      setPendingManual(manual);
    } catch (e) {}
  };

  useEffect(() => {
    loadQueues();
    window.addEventListener("storage", loadQueues);
    const handleSyncFinished = () => {
      setTimeout(loadQueues, 1000);
    };
    window.addEventListener("online", handleSyncFinished);
    window.addEventListener("smartspend-offline-queue-changed", loadQueues);
    return () => {
      window.removeEventListener("storage", loadQueues);
      window.removeEventListener("online", handleSyncFinished);
      window.removeEventListener(
        "smartspend-offline-queue-changed",
        loadQueues,
      );
    };
  }, []);

  const handleManualSync = () => {
    setIsRetrying(true);
    // ExpenseForm owns the authenticated, visible outbox.
    navigate("/dashboard?tab=record");
    window.setTimeout(() => {
      window.dispatchEvent(new Event("smartspend-offline-sync"));
    }, 150);
    toast.info("جاري فتح صندوق المزامنة ومراجعة العمليات المعلقة...");
    setTimeout(() => {
      loadQueues();
      setIsRetrying(false);
    }, 2500);
  };

  const handleDeleteTextItem = (id: string) => {
    try {
      const texts: OfflineTextItem[] = JSON.parse(
        localStorage.getItem("smartspend_offline_texts") || "[]",
      );
      const updated = texts.filter(
        (item) => item.id !== id && item.clientRequestId !== id,
      );
      localStorage.setItem("smartspend_offline_texts", JSON.stringify(updated));
      window.dispatchEvent(new Event("smartspend-offline-queue-changed"));
      loadQueues();
      toast.success("تم حذف العملية المعلقة.");
    } catch (e) {}
  };

  const handleDeleteManualItem = (id: string) => {
    try {
      const manual: OfflineManualItem[] = JSON.parse(
        localStorage.getItem("smartspend_offline_manual") || "[]",
      );
      const updated = manual.filter(
        (item) => item.id !== id && item.clientRequestId !== id,
      );
      localStorage.setItem(
        "smartspend_offline_manual",
        JSON.stringify(updated),
      );
      window.dispatchEvent(new Event("smartspend-offline-queue-changed"));
      loadQueues();
      toast.success("تم حذف العملية المعلقة.");
    } catch (e) {}
  };

  const totalPending = pendingTexts.length + pendingManual.length;

  return (
    <>
      {/* Pending Offline Sync Top Banner */}
      {isOnline && totalPending > 0 && (
        <div
          className="fixed top-[calc(env(safe-area-inset-top)+4.5rem)] start-3 end-3 z-[61] rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-white text-center py-2.5 px-4 text-xs font-bold shadow-md flex items-center justify-center gap-3 animate-in slide-in-from-top duration-300 lg:top-4 lg:start-auto lg:max-w-lg"
          dir="rtl"
        >
          <Database className="w-4 h-4 animate-pulse" />
          <span>
            لديك {totalPending} عمليات مسجلة أوفلاين لم تتم مزامنتها بعد.
          </span>
          <button
            onClick={() => setShowSyncDialog(true)}
            className="bg-white/20 hover:bg-white/30 text-white px-2 py-0.5 rounded-md font-bold text-[10px] transition-colors active-press"
          >
            مراجعة ومزامنة
          </button>
        </div>
      )}

      {/* Sync Manager Modal */}
      {showSyncDialog && (
        <div
          className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
          dir="rtl"
        >
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl border border-slate-100 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-500" />
                <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                  صندوق المزامنة المعلقة
                </h3>
              </div>
              <button
                onClick={() => setShowSyncDialog(false)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 dark:text-slate-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 max-h-[350px] overflow-y-auto space-y-3 hide-scrollbar">
              {totalPending === 0 ? (
                <p className="text-center text-sm text-slate-500 py-6">
                  لا توجد عمليات معلقة حالياً!
                </p>
              ) : (
                <>
                  {pendingTexts.map((item, idx) => {
                    const itemId =
                      item.id || item.clientRequestId || `text-${idx}`;
                    return (
                      <div
                        key={itemId}
                        className="flex justify-between items-center p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/20 text-xs"
                      >
                        <div className="flex-1 min-w-0 pr-1 text-slate-700 dark:text-slate-300 text-right">
                          <p className="font-semibold truncate">
                            "{item.text}"
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            تاريخ التسجيل:{" "}
                            {new Date(item.timestamp).toLocaleTimeString(
                              "ar-EG",
                            )}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeleteTextItem(itemId)}
                          className="p-2 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 rounded-lg transition-colors shrink-0"
                          title="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}

                  {pendingManual.map((item, idx) => {
                    const itemId =
                      item.id || item.clientRequestId || `manual-${idx}`;
                    return (
                      <div
                        key={itemId}
                        className="flex justify-between items-center p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/20 text-xs"
                      >
                        <div className="flex-1 min-w-0 pr-1 text-slate-700 dark:text-slate-300 text-right">
                          <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {item.amount} ج.م - {item.category}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                            {item.description || "معاملة يدوية أوفلاين"}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeleteManualItem(itemId)}
                          className="p-2 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 rounded-lg transition-colors shrink-0"
                          title="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex gap-3">
              <Button
                onClick={handleManualSync}
                disabled={isRetrying || totalPending === 0}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2 gap-2 text-sm font-bold active-press"
              >
                <RefreshCw
                  className={cn("w-4 h-4", isRetrying && "animate-spin")}
                />
                {isRetrying ? "جاري المزامنة..." : "مزامنة الآن"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowSyncDialog(false)}
                className="rounded-xl border-slate-200 dark:border-slate-700 py-2 text-sm font-semibold"
              >
                إغلاق
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
