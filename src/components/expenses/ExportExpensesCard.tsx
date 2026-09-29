import { Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/providers/trpc";

type ExportFile = { format: "json" | "csv" | "xlsx"; data: unknown; filename: string };

/** Hands the file `export.myExpenses` returned to the browser to save. */
function saveExportFile(file: ExportFile): void {
  let blob: Blob;
  if (file.format === "xlsx") {
    const binary = atob(String(file.data));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  } else if (file.format === "csv") {
    // The byte-order mark lets Excel read the Arabic as UTF-8.
    blob = new Blob(["﻿" + String(file.data)], { type: "text/csv;charset=utf-8;" });
  } else {
    blob = new Blob([JSON.stringify(file.data, null, 2)], { type: "application/json" });
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Downloads every entry of the account (up to 10,000, newest first) as Excel or CSV (`export.myExpenses`). */
export function ExportExpensesCard() {
  const exportMutation = trpc.export.myExpenses.useMutation({
    onSuccess: (file) => {
      saveExportFile(file as ExportFile);
      toast.success("الملف نزل على جهازك");
    },
    onError: () => {
      toast.error("مقدرناش نجهز الملف دلوقتي. جرّب تاني بعد شوية.");
    },
  });

  return (
    <section aria-labelledby="export-expenses-title" className="space-y-2">
      <h2 id="export-expenses-title" className="px-1 text-xs font-bold text-muted-foreground">
        بياناتك
      </h2>
      <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold">نزّل مصاريفك</p>
            <p className="text-xs text-muted-foreground">
              كل عملياتك في ملف تفتحه في Excel: التاريخ والنوع والمبلغ والفئة والوصف.
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            className="flex-1"
            disabled={exportMutation.isPending}
            onClick={() => exportMutation.mutate({ format: "xlsx", type: "all" })}
          >
            <Download className="me-2 h-4 w-4" />
            Excel
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            disabled={exportMutation.isPending}
            onClick={() => exportMutation.mutate({ format: "csv", type: "all" })}
          >
            CSV
          </Button>
        </div>
      </div>
    </section>
  );
}
