import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * A page that breaks shows what happened and the way back instead of a blank screen. After a deploy, an open tab can
 * ask for a page file the server no longer has; reloading fetches the new ones.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; stale: boolean }
> {
  state = { failed: false, stale: false };

  static getDerivedStateFromError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      failed: true,
      stale:
        /dynamically imported module|Loading chunk|Importing a module script failed/i.test(
          message,
        ),
    };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
        <p className="font-semibold">
          {this.state.stale
            ? "فيه نسخة جديدة من اللوحة"
            : "الصفحة دي حصل فيها مشكلة"}
        </p>
        <p className="text-sm text-muted-foreground">
          {this.state.stale
            ? "حدّث الصفحة علشان تفتح النسخة الجديدة."
            : "حدّث الصفحة. لو المشكلة فضلت، ابعتها لفريق التطوير."}
        </p>
        <Button onClick={() => window.location.reload()}>حدّث الصفحة</Button>
      </div>
    );
  }
}
