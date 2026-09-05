import { cn } from "@/lib/utils";

interface NetworkStatusToastProps {
  isOnline: boolean;
  showNetworkStatus: boolean;
}

export function NetworkStatusToast({
  isOnline,
  showNetworkStatus,
}: NetworkStatusToastProps) {
  return (
    <>
      {/* Persistent Offline Banner */}
      {!isOnline && (
        <div
          className="fixed top-[calc(env(safe-area-inset-top)+4.5rem)] start-3 end-3 z-[60] rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 text-white text-center py-2 px-4 text-xs font-bold shadow-md flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300 lg:top-4 lg:start-auto lg:max-w-md"
          dir="rtl"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
          <span>
            أنت تعمل حالياً دون اتصال بالإنترنت. تم تفعيل الإدخال المبسط وتعطيل
            العمليات السحابية.
          </span>
        </div>
      )}

      {/* Network Status Toast */}
      {showNetworkStatus && (
        <div
          className={cn(
            "fixed top-[calc(env(safe-area-inset-top)+4.5rem)] start-4 end-4 z-[60] max-w-sm mx-auto rounded-2xl p-3 flex items-center gap-3 border shadow-lg backdrop-blur-2xl animate-in slide-in-from-top duration-500 lg:top-4",
            isOnline
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-900 dark:text-emerald-300"
              : "bg-amber-500/15 border-amber-500/30 text-amber-900 dark:text-amber-300",
          )}
          dir="rtl"
        >
          <div
            className={cn(
              "h-8 w-8 rounded-xl flex items-center justify-center border shrink-0",
              isOnline
                ? "bg-emerald-500/20 border-emerald-500/30"
                : "bg-amber-500/20 border-amber-500/30",
            )}
          >
            {isOnline ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-emerald-600 dark:text-emerald-400"
              >
                <path d="M12 20h.01" />
                <path d="M8.5 16.5c3.5-3.5 6.5-3.5 10 0" />
                <path d="M5 13c5-5 9-5 14 0" />
                <path d="M2 9.5c7-7 13-7 20 0" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-amber-600 dark:text-amber-400"
              >
                <path d="M1 1l22 22" />
                <path d="M16.72 11.06A10.94 10.94 0 0 1 19 13" />
                <path d="M5 13a10.94 10.94 0 0 1 5.83-2.84" />
                <path d="M12 20h.01" />
                <path d="M8.5 16.5a4.92 4.92 0 0 1 4.24-1.44" />
                <path d="M22 9.5A19.86 19.86 0 0 0 12 7c-2.3 0-4.5.42-6.55 1.18" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0 text-end">
            <p className="text-sm font-bold leading-tight">
              {isOnline ? "تمت العودة للإنترنت" : "بدون اتصال بالإنترنت"}
            </p>
            <p className="text-[11px] opacity-80 mt-0.5 leading-normal">
              {isOnline
                ? "الاتصال متاح الآن. سنعرض حالة أي عمليات معلقة بشكل منفصل."
                : "سيتم حفظ العمليات محلياً لحين الاتصال."}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
