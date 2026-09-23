/**
 * The cards a call shows next to what is said: a figure with its period and what it leaves out, a draft waiting
 * for the user's tap or yes, steps from the app's guide, and a gold or currency price with its source and time.
 */
import { useEffect, useState } from "react";
import { Check, ExternalLink, Info, X } from "lucide-react";
import type {
  VoiceCard,
  VoiceDraftCard,
  VoiceFactCard,
  VoiceGuideCard,
  VoicePriceCard,
} from "@contracts/voice-protocol";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatAmount(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function Amount({ value, unit }: { value: number; unit?: string }) {
  return (
    <span className="font-semibold tabular-nums" dir="ltr">
      {formatAmount(value)}{" "}
      <span className="text-xs font-normal text-muted-foreground">{!unit || unit === "EGP" ? "ج.م" : unit}</span>
    </span>
  );
}

function FactCard({ card }: { card: VoiceFactCard }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{card.title}</p>
        {card.period && (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{card.period}</span>
        )}
      </div>
      <ul className="space-y-1.5">
        {card.items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-muted-foreground">{item.label}</span>
            <Amount value={item.value} unit={item.unit} />
          </li>
        ))}
      </ul>
      {card.coverage && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {card.coverage}
        </p>
      )}
    </div>
  );
}

const DRAFT_STATUS: Record<Exclude<VoiceDraftCard["status"], "pending">, { label: string; className: string }> = {
  executed: { label: "اتنفذ", className: "text-emerald-600 dark:text-emerald-400" },
  cancelled: { label: "اتلغى", className: "text-muted-foreground" },
  expired: { label: "انتهت صلاحيته", className: "text-muted-foreground" },
  failed: { label: "ماتنفذش", className: "text-red-600 dark:text-red-400" },
};

function DraftCard({
  card,
  onConfirm,
  onCancel,
}: {
  card: VoiceDraftCard;
  onConfirm(draftId: string): void;
  onCancel(draftId: string): void;
}) {
  // A tap waits for the server's answer, which updates the card; without one the buttons come back.
  const [sentFor, setSentFor] = useState<string | null>(null);
  useEffect(() => {
    if (!sentFor) return;
    const timer = setTimeout(() => setSentFor(null), 6_000);
    return () => clearTimeout(timer);
  }, [sentFor]);
  const pending = card.status === "pending";
  const waiting = pending && sentFor === card.draftId;
  const status = card.status === "pending" ? null : DRAFT_STATUS[card.status];

  return (
    <div
      className={cn(
        "rounded-2xl border p-3 shadow-sm",
        pending ? "border-emerald-500/40 bg-emerald-500/5" : "border-border/60 bg-card",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{card.title}</p>
        {status && (
          <span className={cn("flex shrink-0 items-center gap-1 text-xs font-medium", status.className)}>
            {card.status === "executed" ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            {status.label}
          </span>
        )}
      </div>
      {card.items.length > 0 && (
        <ul className="space-y-1.5">
          {card.items.map((item, index) => (
            <li key={`${item.label}-${index}`} className="flex items-start justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate">{item.label}</span>
                {item.detail && <span className="block text-xs text-muted-foreground">{item.detail}</span>}
              </span>
              {typeof item.amount === "number" && <Amount value={item.amount} />}
            </li>
          ))}
        </ul>
      )}
      {typeof card.total === "number" && card.items.length > 1 && (
        <div className="mt-2 flex items-center justify-between border-t border-border/50 pt-2 text-sm">
          <span className="text-muted-foreground">الإجمالي</span>
          <Amount value={card.total} />
        </div>
      )}
      {card.message && <p className="mt-2 text-xs text-muted-foreground">{card.message}</p>}
      {pending && (
        <>
          {card.requiresTap && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">دي بتتنفذ بالضغط هنا بس، مش بالكلام.</p>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              className="h-10 flex-1 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={waiting}
              onClick={() => {
                setSentFor(card.draftId);
                onConfirm(card.draftId);
              }}
            >
              <Check className="me-1 h-4 w-4" />
              تأكيد
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-10 flex-1 rounded-xl"
              disabled={waiting}
              onClick={() => {
                setSentFor(card.draftId);
                onCancel(card.draftId);
              }}
            >
              إلغاء
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function GuideCard({ card, onOpenRoute }: { card: VoiceGuideCard; onOpenRoute(route: string): void }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
      <p className="mb-2 text-sm font-semibold">{card.title}</p>
      <ol className="list-decimal space-y-1 ps-5 text-sm">
        {card.steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
      {card.route && (
        <Button size="sm" variant="outline" className="mt-3 h-10 w-full rounded-xl" onClick={() => onOpenRoute(card.route!)}>
          <ExternalLink className="me-1 h-4 w-4" />
          افتح الشاشة
        </Button>
      )}
    </div>
  );
}

function PriceCard({ card }: { card: VoicePriceCard }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{card.title}</p>
        <Amount value={card.value} unit={card.unit} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        المصدر: {card.source} · {card.asOf}
      </p>
    </div>
  );
}

export function VoiceCallCard({
  card,
  onConfirm,
  onCancel,
  onOpenRoute,
}: {
  card: VoiceCard;
  onConfirm(draftId: string): void;
  onCancel(draftId: string): void;
  onOpenRoute(route: string): void;
}) {
  switch (card.kind) {
    case "fact":
      return <FactCard card={card} />;
    case "draft":
      return <DraftCard card={card} onConfirm={onConfirm} onCancel={onCancel} />;
    case "guide":
      return <GuideCard card={card} onOpenRoute={onOpenRoute} />;
    case "price":
      return <PriceCard card={card} />;
    default:
      // A card kind from a newer server than this app knows.
      return null;
  }
}
