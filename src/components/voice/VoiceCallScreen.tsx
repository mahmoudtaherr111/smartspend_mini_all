/**
 * The live call's screen (loaded by VoiceCallHost only while there is a call): the explanation before the first
 * call, the call itself (what it is doing, a voice-driven orb, what was said and the cards), a bar at the top of
 * the app when the call is shrunk, the end of the call with what was done, and why a call could not start.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Captions,
  CaptionsOff,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Keyboard,
  Mic,
  MicOff,
  PhoneOff,
  SendHorizontal,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useSheetManager } from "@/hooks/useSheetManager";
import { cn } from "@/lib/utils";
import {
  connectedSeconds,
  voiceCall,
  type CallActivity,
  type CallEnding,
  type VoiceCallView,
} from "@/lib/voice/call-store";
import { VoiceCallCard } from "./VoiceCallCards";

const ACTIVITY: Record<CallActivity, string> = {
  connecting: "بنوصّل المكالمة…",
  listening: "سامعك",
  user_speaking: "كمّل، سامعك…",
  thinking: "بيفكر…",
  speaking: "سمارت بيتكلم",
  awaiting_confirmation: "مستني موافقتك",
  reconnecting: "بنرجّع الخط…",
};

const END_REASON: Partial<Record<CallEnding["reason"], string>> = {
  time_limit: "خلص وقت المكالمة.",
  month_used: "خلصت دقايق المكالمات بتاعة الشهر.",
  daily_cost_cap: "وصلت لحد المكالمات النهارده.",
  inactive: "المكالمة قفلت لوحدها عشان مفيش كلام من شوية.",
  provider: "محرك الصوت وقف، فالمكالمة قفلت.",
  network: "الخط قطع ومقدرناش نرجّعه.",
  lost: "الخط قطع ومقدرناش نرجّعه.",
  server: "حصلت مشكلة عندنا وقفلت المكالمة.",
};

function clock(seconds: number): string {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function spokenDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const parts: string[] = [];
  if (minutes === 1) parts.push("دقيقة");
  else if (minutes === 2) parts.push("دقيقتين");
  else if (minutes >= 3 && minutes <= 10) parts.push(`${minutes} دقايق`);
  else if (minutes > 10) parts.push(`${minutes} دقيقة`);
  if (rest > 0) parts.push(`${rest} ثانية`);
  return parts.length ? parts.join(" و") : "أقل من ثانية";
}

/** Re-renders every second while `running`. */
function useSecondTick(running: boolean): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((tick) => tick + 1), 1_000);
    return () => clearInterval(timer);
  }, [running]);
}

function CallOrb({ activity, live, size = "lg" }: { activity: CallActivity; live: boolean; size?: "lg" | "sm" }) {
  const ring = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!live || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let level = 0;
    const step = () => {
      const { input, output } = voiceCall.levels();
      level += (Math.max(input, output) - level) * 0.3;
      ring.current?.style.setProperty("--level", level.toFixed(3));
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [live]);

  const big = size === "lg";
  return (
    <div className={cn("relative flex items-center justify-center", big ? "h-40 w-40" : "h-24 w-24")}>
      <div
        ref={ring}
        className={cn(
          "absolute inset-0 rounded-full bg-emerald-400/25 transition-transform duration-75 dark:bg-emerald-400/20",
          "[transform:scale(calc(1+var(--level,0)*0.35))]",
          activity === "thinking" && "animate-pulse",
        )}
      />
      <div
        className={cn(
          "relative flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 shadow-xl",
          big ? "h-28 w-28" : "h-20 w-20",
          activity === "connecting" || activity === "reconnecting" ? "animate-pulse" : "",
        )}
      >
        <Sparkles className={cn("text-white", big ? "h-11 w-11" : "h-8 w-8")} />
      </div>
    </div>
  );
}

function IntroPanel() {
  const points = [
    "سمارت مساعد بالذكاء الاصطناعي، مش إنسان. بيرد من أرقامك المتسجلة، ولو مش متأكد بيقولك.",
    "الميكروفون مفتوح طول المكالمة، بس كلامك بيتبعت وانت بتتكلم بس.",
    "أي حاجة هتتسجل أو تتغير بتظهرلك الأول، ومش بتتنفذ غير بموافقتك.",
    "مابنحفظش صوتك ولا نص المكالمة. بنحفظ ملخص قصير تقدر تشوفه وتمسحه.",
  ];
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <CallOrb activity="listening" live={false} />
      <div className="space-y-1">
        <h2 className="text-xl font-bold">كلّم سمارت</h2>
        <p className="text-sm text-muted-foreground">اتكلم عن فلوسك زي ما بتكلم صاحبك</p>
      </div>
      <ul className="w-full max-w-sm space-y-3 text-start text-sm">
        {points.map((point) => (
          <li key={point} className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
      <div className="flex w-full max-w-sm flex-col gap-2">
        <Button
          size="lg"
          className="h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-base font-bold text-white"
          onClick={() => voiceCall.acceptIntro()}
        >
          ابدأ المكالمة
        </Button>
        <Button variant="ghost" className="h-11 rounded-xl" onClick={() => voiceCall.close()}>
          مش دلوقتي
        </Button>
      </div>
    </div>
  );
}

function EndPanel({ view, onOpenMemory }: { view: VoiceCallView; onOpenMemory(): void }) {
  const ending = view.ending!;
  const seconds = ending.billedSeconds ?? connectedSeconds(view.meter);
  const reason = END_REASON[ending.reason];
  return (
    <div className="flex flex-1 flex-col items-center gap-5 overflow-y-auto px-6 py-8 text-center">
      <CircleCheck className="h-14 w-14 text-emerald-600 dark:text-emerald-400" />
      <div className="space-y-1">
        <h2 className="text-xl font-bold">المكالمة خلصت</h2>
        {reason && <p className="text-sm text-muted-foreground">{reason}</p>}
        <p className="text-sm text-muted-foreground">المدة: {spokenDuration(seconds)}</p>
      </div>
      {ending.done.length > 0 && (
        <section className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-4 text-start">
          <p className="mb-2 text-sm font-semibold">اللي اتعمل</p>
          <ul className="space-y-1.5 text-sm">
            {ending.done.map((line, index) => (
              <li key={index} className="flex gap-2">
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}
      {ending.notDone.length > 0 && (
        <section className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-4 text-start">
          <p className="mb-2 text-sm font-semibold">اللي ماتعملش</p>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {ending.notDone.map((line, index) => (
              <li key={index}>• {line}</li>
            ))}
          </ul>
        </section>
      )}
      <div className="max-w-sm space-y-2 text-xs text-muted-foreground">
        <p>ملخص المكالمة وأهم اللي قلته بيتحفظوا في «ذاكرة سمارت» خلال ثواني، وتقدر تشوفهم وتمسحهم من هناك.</p>
        <Button variant="outline" size="sm" className="h-10 rounded-xl" onClick={onOpenMemory}>
          افتح ذاكرة سمارت
        </Button>
      </div>
      <div className="mt-auto flex w-full max-w-sm flex-col gap-2">
        <Button
          size="lg"
          className="h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 font-bold text-white"
          onClick={() => voiceCall.restart()}
        >
          مكالمة جديدة
        </Button>
        <Button variant="ghost" className="h-11 rounded-xl" onClick={() => voiceCall.close()}>
          قفل
        </Button>
      </div>
    </div>
  );
}

function FailurePanel({ view, onChat }: { view: VoiceCallView; onChat(): void }) {
  const failure = view.failure!;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
      <CircleAlert className="h-12 w-12 text-amber-600 dark:text-amber-400" />
      <p className="max-w-sm text-base">{failure.message}</p>
      <div className="flex w-full max-w-sm flex-col gap-2">
        {failure.fallbackChat && (
          <Button size="lg" className="h-12 rounded-xl" onClick={onChat}>
            كمّل في الشات
          </Button>
        )}
        <Button variant="ghost" className="h-11 rounded-xl" onClick={() => voiceCall.close()}>
          قفل
        </Button>
      </div>
    </div>
  );
}

function TracePanel({ view }: { view: VoiceCallView }) {
  const trace = view.trace;
  const latest = trace.firstAudioMs[trace.firstAudioMs.length - 1];
  const rows: Array<[string, string]> = [
    ["call", view.callId ?? "-"],
    ["rtt", trace.rttMs !== null ? `${trace.rttMs} ms` : "-"],
    ["first audio", latest !== undefined ? `${latest} ms (${trace.firstAudioMs.length})` : "-"],
    ["reconnects", String(trace.reconnects)],
    ["frames sent", String(trace.sentFrames)],
    ["noise floor", trace.noiseFloorDb !== null ? `${trace.noiseFloorDb.toFixed(0)} dBFS` : "-"],
    ["device rate", trace.sampleRate ? `${trace.sampleRate} Hz` : "-"],
    ["playback", `${trace.bufferedMs} ms queued · ${trace.cushionMs} ms cushion`],
  ];
  return (
    <details className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground" dir="ltr">
      <summary className="cursor-pointer select-none font-medium text-foreground/80">Voice trace (admin)</summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt>{label}</dt>
            <dd className="truncate text-end font-mono">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function Composer() {
  const [text, setText] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (voiceCall.sendText(text)) setText("");
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-2 px-4 pb-2">
      <Input
        autoFocus
        value={text}
        maxLength={500}
        onChange={(event) => setText(event.target.value)}
        placeholder="اكتب لسمارت…"
        className="h-11 rounded-xl"
        aria-label="اكتب لسمارت"
      />
      <Button type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-xl" disabled={!text.trim()} aria-label="ابعت">
        <SendHorizontal className="h-5 w-5 rtl:-scale-x-100" />
      </Button>
    </form>
  );
}

function LiveCall({ view, onOpenRoute }: { view: VoiceCallView; onOpenRoute(route: string): void }) {
  const { isAdmin } = useAuth();
  const [typing, setTyping] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const live = view.phase === "live";
  useSecondTick(view.meter.liveSince !== null);

  const items = view.captionsOn ? view.timeline : view.timeline.filter((item) => item.kind === "card");
  const lastItem = items[items.length - 1];
  useEffect(() => {
    const element = scroller.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [items.length, lastItem]);

  const seconds = connectedSeconds(view.meter);
  const left = view.maxSeconds > 0 ? view.maxSeconds - seconds : null;
  const showComposer = typing || !view.micAvailable;

  return (
    <>
      <header className="flex items-center justify-between gap-2 px-3 py-2">
        <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full" onClick={() => voiceCall.minimize()} aria-label="صغّر المكالمة">
          <ChevronDown className="h-6 w-6" />
        </Button>
        <div className="min-w-0 text-center">
          <p className="text-sm font-semibold">سمارت</p>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono" dir="ltr">
              {clock(seconds)}
            </span>
            {left !== null && left <= 120 && (
              <>
                {" · فاضل "}
                <span className="font-mono" dir="ltr">
                  {clock(left)}
                </span>
              </>
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-full"
          onClick={() => voiceCall.toggleCaptions()}
          aria-label={view.captionsOn ? "اخفي الكلام المكتوب" : "اعرض الكلام المكتوب"}
        >
          {view.captionsOn ? <Captions className="h-5 w-5" /> : <CaptionsOff className="h-5 w-5" />}
        </Button>
      </header>

      <div className="flex flex-col items-center gap-2 pb-2 pt-2">
        <CallOrb activity={view.activity} live={live} />
        <p className="text-sm font-medium" aria-live="polite">
          {ACTIVITY[view.activity]}
        </p>
      </div>

      {view.notice && (
        <div
          className={cn(
            "mx-4 mb-2 rounded-xl px-3 py-2 text-center text-sm",
            view.notice.kind === "time_warning"
              ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
              : "bg-muted text-foreground",
          )}
          role="status"
        >
          {view.notice.message}
        </div>
      )}

      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 pb-3">
        {items.length === 0 && live && (
          <p className="mx-auto mt-4 max-w-xs text-center text-sm text-muted-foreground">
            اتكلم عادي. مثلاً: «صرفت كام النهارده؟» أو «دفعت خمسين مواصلات وتلاتين أكل».
          </p>
        )}
        {items.map((item) =>
          item.kind === "caption" ? (
            <p
              key={item.key}
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                item.role === "user"
                  ? "ms-auto rounded-ee-md bg-emerald-600 text-white"
                  : "me-auto rounded-es-md bg-muted text-foreground",
              )}
            >
              {item.text}
            </p>
          ) : (
            <VoiceCallCard
              key={item.key}
              card={item.card}
              onConfirm={(id) => voiceCall.confirmDraft(id)}
              onCancel={(id) => voiceCall.cancelDraft(id)}
              onOpenRoute={onOpenRoute}
            />
          ),
        )}
        {isAdmin && <TracePanel view={view} />}
      </div>

      {showComposer && <Composer />}

      <footer className="flex items-center justify-center gap-5 px-4 pb-4 pt-2">
        <Button
          variant="outline"
          size="icon"
          className={cn("h-14 w-14 rounded-full", typing && "border-emerald-500/40 bg-emerald-500/10")}
          onClick={() => setTyping((value) => !value)}
          aria-label="اكتب بدل ما تتكلم"
        >
          <Keyboard className="h-6 w-6" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          disabled={!view.micAvailable}
          className={cn("h-14 w-14 rounded-full", view.muted && "border-red-500/40 bg-red-500/10 text-red-600")}
          onClick={() => voiceCall.toggleMute()}
          aria-label={view.muted ? "افتح الميكروفون" : "اقفل الميكروفون"}
        >
          {view.muted || !view.micAvailable ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </Button>
        <Button
          size="icon"
          className="h-16 w-16 rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700"
          onClick={() => voiceCall.end()}
          aria-label="اقفل المكالمة"
        >
          <PhoneOff className="h-7 w-7" />
        </Button>
      </footer>
    </>
  );
}

function MiniBar({ view }: { view: VoiceCallView }) {
  useSecondTick(view.meter.liveSince !== null);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center pt-safe" dir="rtl">
      <div className="pointer-events-auto mt-2 flex items-center gap-1 rounded-full bg-emerald-600 py-1 pe-1 ps-3 text-white shadow-lg">
        <button type="button" className="flex items-center gap-2 py-1.5 text-sm" onClick={() => voiceCall.expand()}>
          <span className={cn("h-2 w-2 rounded-full bg-white", view.phase === "live" ? "animate-pulse" : "opacity-50")} />
          <span>{ACTIVITY[view.activity]}</span>
          <span className="font-mono text-xs opacity-90" dir="ltr">
            {clock(connectedSeconds(view.meter))}
          </span>
        </button>
        <button
          type="button"
          className="ms-1 flex h-8 w-8 items-center justify-center rounded-full bg-red-600"
          onClick={() => voiceCall.end()}
          aria-label="اقفل المكالمة"
        >
          <PhoneOff className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function VoiceCallScreen({ view, onOpenMemory }: { view: VoiceCallView; onOpenMemory(): void }) {
  const navigate = useNavigate();
  const inCall = view.phase === "starting" || view.phase === "live" || view.phase === "reconnecting";
  const shown = view.phase !== "idle" && !(inCall && view.minimized);
  // Back shrinks a call in progress; on the other screens it closes them.
  useSheetManager(shown, inCall ? () => voiceCall.minimize() : () => voiceCall.close());

  if (view.phase === "idle") return null;
  if (inCall && view.minimized) return <MiniBar view={view} />;

  const openRoute = (route: string) => {
    navigate(route);
    voiceCall.minimize();
  };
  const openChat = () => {
    voiceCall.close();
    navigate("/ai?ai_tab=chat");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[70] flex flex-col bg-background pb-safe pt-safe text-foreground"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label="مكالمة سمارت"
    >
      {view.phase === "intro" && <IntroPanel />}
      {inCall && <LiveCall view={view} onOpenRoute={openRoute} />}
      {view.phase === "ended" && view.ending && <EndPanel view={view} onOpenMemory={onOpenMemory} />}
      {view.phase === "failed" && view.failure && !view.failure.legacy && <FailurePanel view={view} onChat={openChat} />}
    </motion.div>
  );
}
