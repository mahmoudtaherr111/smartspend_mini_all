import React, { useState } from "react";
import { Brain, Trash2, AlertTriangle, CheckCircle2, Clock, Sparkles, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useHistoryBound } from "@/hooks/useHistoryBound";

interface AIMemoryManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AIMemoryManager: React.FC<AIMemoryManagerProps> = ({ isOpen, onClose }) => {
  useHistoryBound(isOpen, onClose);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const memoriesQuery = trpc.chat.listMemories.useQuery(undefined, {
    enabled: isOpen,
    staleTime: 10_000,
  });

  const forgetMutation = trpc.chat.forgetMemory.useMutation({
    onSuccess: () => {
      toast.success("تم نسيان المعلومة بنجاح 🧹");
      utils.chat.listMemories.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "حدث خطأ أثناء حذف المعلومة");
    },
    onSettled: () => {
      setDeletingId(null);
    },
  });

  const clearAllMutation = trpc.chat.clearAllMemories.useMutation({
    onSuccess: (data) => {
      toast.success(`تم مسح ${data.count ?? 0} معلومة من الذاكرة الذكية بنجاح 🧹`);
      setConfirmClearAll(false);
      utils.chat.listMemories.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "حدث خطأ أثناء مسح الذكريات");
    },
  });

  const handleForget = (id: number) => {
    setDeletingId(id);
    forgetMutation.mutate({ memoryId: id });
  };

  const handleClearAll = () => {
    clearAllMutation.mutate();
  };

  const getMemoryTypeLabel = (type: string) => {
    switch (type) {
      case "fact":
        return { label: "حقيقة ثابتة", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" };
      case "summary":
        return { label: "ملخص محادثة", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" };
      case "preference":
        return { label: "تفضيل شخصي", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
      case "pattern":
        return { label: "نمط إنفاق", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
      default:
        return { label: "معلومة ذكية", color: "bg-slate-500/10 text-slate-400 border-slate-500/20" };
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 10 }}
          transition={{ type: "spring", duration: 0.35 }}
          className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/95 p-6 shadow-2xl backdrop-blur-xl text-slate-100 max-h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 text-indigo-400 shadow-inner">
                <Brain className="h-6 w-6 animate-pulse" />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
                  <span>إدارة الذاكرة الذكية</span>
                  <Sparkles className="h-4 w-4 text-amber-400" />
                </h2>
                <p className="text-xs text-slate-400">
                  المساعد الذكي بيتعلم عاداتك وتفضيلاتك المالية عشان يقدملك تحليل مخصص. تقدر تتحكم في كل معلومة هنا.
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto py-4 space-y-3 min-h-[250px] pr-1">
            {memoriesQuery.isLoading ? (
              <div className="flex flex-col items-center justify-center h-48 space-y-3 text-slate-400">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                <span className="text-sm">جاري تحميل الذكريات الذكية...</span>
              </div>
            ) : memoriesQuery.isError ? (
              <div className="flex flex-col items-center justify-center h-48 space-y-3 text-red-400">
                <AlertTriangle className="h-8 w-8" />
                <span className="text-sm">حدث خطأ في جلب البيانات: {memoriesQuery.error.message}</span>
              </div>
            ) : memoriesQuery.data && memoriesQuery.data.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 space-y-3 text-slate-400 border border-dashed border-slate-800 rounded-xl p-6 text-center">
                <Brain className="h-10 w-10 text-slate-600" />
                <div className="space-y-1">
                  <p className="font-medium text-slate-300">الذاكرة الذكية فارغة حالياً</p>
                  <p className="text-xs text-slate-500">
                    لما تبدأ تتكلم مع المساعد الذكي وتديله تعليمات أو تفضيلات مالية، هيحفظها هنا عشان يفتكرها المرات الجاية.
                  </p>
                </div>
              </div>
            ) : (
              memoriesQuery.data?.map((item) => {
                const typeMeta = getMemoryTypeLabel(item.memoryType);
                return (
                  <div
                    key={item.id}
                    className="group relative flex items-start justify-between gap-4 rounded-xl border border-slate-800/80 bg-slate-900/50 p-3.5 transition-all hover:border-slate-700 hover:bg-slate-900 shadow-sm"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-md border", typeMeta.color)}>
                          {typeMeta.label}
                        </span>
                        {item.importance && (
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                            أهمية: {Math.min(100, Math.round((item.importance / 100) * 100))}%
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-200 leading-relaxed font-medium">
                        {item.content}
                      </p>
                      {item.updatedAt && (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                          <Clock className="h-3 w-3" />
                          <span>تحديث: {new Date(item.updatedAt).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" })}</span>
                        </div>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={deletingId === item.id}
                      onClick={() => handleForget(item.id)}
                      className="h-8 w-8 rounded-lg text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors shrink-0"
                      title="نسيان هذه المعلومة"
                    >
                      {deletingId === item.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-red-400" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {memoriesQuery.data && memoriesQuery.data.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-800 pt-4 mt-2">
              <span className="text-xs text-slate-400">
                إجمالي المعلومات المحفوظة: <strong className="text-slate-200">{memoriesQuery.data.length}</strong>
              </span>

              {confirmClearAll ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-400 font-medium">هل أنت متأكد من مسح الكل؟</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleClearAll}
                    disabled={clearAllMutation.isPending}
                    className="h-8 text-xs font-semibold bg-red-600 hover:bg-red-700"
                  >
                    {clearAllMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    تأكيد المسح
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmClearAll(false)}
                    className="h-8 text-xs text-slate-400 hover:text-slate-200"
                  >
                    إلغاء
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmClearAll(true)}
                  className="h-8 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  مسح كل الذكريات
                </Button>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
