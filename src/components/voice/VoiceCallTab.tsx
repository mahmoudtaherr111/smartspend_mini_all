/**
 * The AI Center's call tab: pick a voice and start the call (`voice.eligibility` says the minutes left and whether a
 * call can start now).
 */
import { Skeleton } from "@/components/ui/skeleton";
import { useVoiceEligibility } from "@/hooks/useVoiceCallEntry";
import { VoiceCallLauncher } from "./CallSmartButton";

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
  if (isLoading || !data) return <TabSkeleton />;
  return (
    <VoiceCallLauncher
      voices={data.voices}
      defaultVoice={data.defaultVoice}
      minutesLeft={data.minutesLeft}
      blockedReason={data.blockedReason ?? null}
    />
  );
}
