/**
 * The AI Center's call tab: the rebuilt call for users it is open to (`voice.eligibility`), the old call screen for
 * everyone else until the rollout is complete.
 */
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useVoiceEligibility } from "@/hooks/useVoiceCallEntry";
import { VoiceCallLauncher } from "./CallSmartButton";

const AIVoiceCall = lazy(() => import("@/components/ai/AIVoiceCall"));

function TabSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="mx-auto h-28 w-28 rounded-full" />
      <Skeleton className="h-12 w-full rounded-xl" />
    </div>
  );
}

export default function VoiceCallTab() {
  const { data, isLoading } = useVoiceEligibility();
  if (isLoading) return <TabSkeleton />;
  if (data?.v2) {
    return (
      <VoiceCallLauncher
        voices={data.voices}
        defaultVoice={data.defaultVoice}
        minutesLeft={data.minutesLeft}
        blockedReason={data.blockedReason ?? null}
      />
    );
  }
  return (
    <Suspense fallback={<TabSkeleton />}>
      <AIVoiceCall />
    </Suspense>
  );
}
