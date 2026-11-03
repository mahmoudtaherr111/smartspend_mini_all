import { AlertTriangle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function Loading({ full = false }: { full?: boolean }) {
  return (
    <div className={`flex items-center justify-center text-muted-foreground ${full ? "min-h-screen" : "py-24"}`}>
      <Loader2 className="size-6 animate-spin" aria-label="بيحمّل" />
    </div>
  );
}

/** A failed load says what happened and offers the retry, never a blank area. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
      <AlertTriangle className="size-6 text-amber-600" aria-hidden />
      <p className="text-sm">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        جرّب تاني
      </Button>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
