/**
 * What the ways into the live call need (src/components/voice/CallSmartButton.tsx): whether the rebuilt call is
 * open to this user and how many minutes are left, and starting a call from a tap.
 */
import { useCallback } from "react";
import { trpc } from "@/providers/trpc";
import { preferredVoice, voiceCall } from "@/lib/voice/call-store";

export function useVoiceEligibility() {
  return trpc.voice.eligibility.useQuery(undefined, { staleTime: 60_000 });
}

/** Starts the call from a tap; the call screen takes it from there. */
export function useStartCall(): (voice?: string) => void {
  const utils = trpc.useUtils();
  return useCallback(
    (voice?: string) =>
      voiceCall.open({
        voice: voice ?? preferredVoice(),
        startCall: (input) => utils.client.voice.startCall.mutate(input),
      }),
    [utils],
  );
}
