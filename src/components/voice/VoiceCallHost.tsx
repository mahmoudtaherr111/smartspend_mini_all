/**
 * Mounted once in the app shell (App.tsx), inside the router, so a call keeps going on every page: it shows the
 * call screen while there is a call, refreshes what a confirmed draft changed, and hands a user outside the rebuilt
 * call's rollout to the old call screen.
 */
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useVoiceCallView, voiceCall } from "@/lib/voice/call-store";

const VoiceCallScreen = lazy(() => import("./VoiceCallScreen"));
const AIMemoryManager = lazy(() =>
  import("@/components/ai/AIMemoryManager").then((module) => ({ default: module.AIMemoryManager })),
);

export function VoiceCallHost() {
  const view = useVoiceCallView();
  const utils = trpc.useUtils();
  const [memoryOpen, setMemoryOpen] = useState(false);

  const executed = useRef(view.executed);
  useEffect(() => {
    // A confirmed draft can change expenses, budgets, goals, wallets or the profile behind the call.
    if (view.executed > executed.current) void utils.invalidate();
    executed.current = view.executed;
  }, [view.executed, utils]);

  useEffect(() => {
    if (view.phase !== "ended") return;
    void utils.voice.eligibility.invalidate();
    void utils.voice.listCalls.invalidate();
  }, [view.phase, utils]);

  const openMemory = () => {
    voiceCall.close();
    setMemoryOpen(true);
    // The summary is written a few seconds after the call; look again once it has had the time.
    setTimeout(() => void utils.chat.listMemories.invalidate(), 6_000);
  };

  return (
    <Suspense fallback={null}>
      {view.phase !== "idle" && <VoiceCallScreen view={view} onOpenMemory={openMemory} />}
      {memoryOpen && <AIMemoryManager isOpen onClose={() => setMemoryOpen(false)} />}
    </Suspense>
  );
}
