import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Shown while a page has unsaved changes: how many, and the two ways out. Leaving the page with changes asks first,
 * so nothing typed is lost by a stray click.
 */
export function SaveBar({
  changes,
  busy,
  onSave,
  onDiscard,
}: {
  changes: number;
  busy: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  useEffect(() => {
    if (!changes) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changes]);

  if (!changes) return null;
  return (
    <div className="sticky bottom-4 z-20 mt-6 flex flex-wrap items-center gap-3 rounded-xl border bg-background p-3 shadow-lg" role="status">
      <span className="flex-1 text-sm font-semibold">{changes === 1 ? "فيه تغيير واحد ما اتحفظش" : `فيه ${changes} تغييرات ما اتحفظتش`}</span>
      <Button onClick={onSave} disabled={busy}>
        {busy ? "بيحفظ…" : "احفظ"}
      </Button>
      <Button variant="outline" onClick={onDiscard} disabled={busy}>
        تجاهل
      </Button>
    </div>
  );
}
