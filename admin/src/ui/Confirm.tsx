import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@admin/kit/dialog";
import { Button } from "@admin/kit/button";
import { Input } from "@admin/kit/input";

/**
 * Asks before a change, saying exactly what will happen. A change that cannot be undone also asks the admin to type
 * a word, so it never happens by a slipped click.
 */
export function Confirm({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  danger = false,
  typeToConfirm,
  busy = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  typeToConfirm?: string;
  busy?: boolean;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const ready = !typeToConfirm || typed.trim() === typeToConfirm;
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) setTyped("");
        onOpenChange(value);
      }}
    >
      <DialogContent dir="rtl" className="text-start">
        <DialogHeader className="text-start">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-foreground">{children}</div>
          </DialogDescription>
        </DialogHeader>
        {typeToConfirm && (
          <div className="space-y-1.5">
            <label htmlFor="confirm-word" className="text-sm">
              اكتب «{typeToConfirm}» للتأكيد
            </label>
            <Input id="confirm-word" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" />
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-start">
          <Button variant={danger ? "destructive" : "default"} disabled={!ready || busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            رجوع
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
