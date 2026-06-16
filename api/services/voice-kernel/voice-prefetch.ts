import { compileDataNeeds, routeIntent } from "../ai-kernel";
import { resolveKernelDataNeeds } from "../finance-semantic-layer";
import type { DataNeed, DataNeedKind, ResolvedFact } from "../ai-kernel/types";
import type { VoiceToolExecutionContext, VoicePrefetchState } from "./types";
import { updateVoiceSessionState } from "./voice-session-state";

const VOICE_PREFETCH_STRUCTURED_KINDS = new Set<DataNeedKind>([
  "finance.summary",
  "finance.category_total",
  "finance.period_comparison",
  "finance.goal_progress",
  "wallet.summary",
  "profile.snapshot",
  "goals.active",
]);

function voicePrefetchNeeds(dataNeeds: DataNeed[]): {
  needs: DataNeed[];
  skipped: string[];
} {
  const needs = dataNeeds.filter(
    (need) => need.priority === "hot" && VOICE_PREFETCH_STRUCTURED_KINDS.has(need.kind),
  );
  const skipped = dataNeeds
    .filter((need) => !needs.includes(need) && need.kind !== "none")
    .map((need) => need.kind);
  return { needs, skipped };
}

function previewFacts(facts: ResolvedFact[]): VoicePrefetchState["factsPreview"] {
  return facts.slice(0, 6).map((fact) => ({
    label: fact.label,
    value: fact.value,
  }));
}

export async function prefetchVoiceTurnContext(input: {
  ctx: VoiceToolExecutionContext;
  transcript: string;
}): Promise<VoicePrefetchState | null> {
  const transcript = input.transcript.trim();
  if (transcript.length < 2) return null;

  const startedAt = new Date().toISOString();
  const intent = routeIntent(transcript);
  const dataNeeds = compileDataNeeds(intent).slice(0, 3);
  const prefetch = voicePrefetchNeeds(dataNeeds);
  const errors: string[] = [];
  const facts: ResolvedFact[] = [];
  const cacheHits: string[] = prefetch.skipped.map((kind) => `voice_prefetch:skipped:${kind}`);

  try {
    if (prefetch.needs.length > 0) {
      const finance = await resolveKernelDataNeeds(
        {
          userId: input.ctx.userId,
          userType: input.ctx.userType,
        },
        prefetch.needs,
      );
      facts.push(...finance.facts);
      errors.push(...finance.errors);
      cacheHits.push(...finance.cacheHits);
    }
  } catch (error) {
    errors.push(`finance:${error instanceof Error ? error.message : String(error)}`);
  }

  const prefetchState: VoicePrefetchState = {
    transcript,
    intentKind: intent.kind,
    dataNeedKinds: prefetch.needs.map((need) => need.kind),
    factsPreview: previewFacts(facts),
    cacheHits,
    errors,
    startedAt,
    completedAt: new Date().toISOString(),
  };

  await updateVoiceSessionState(input.ctx.sessionId, (state) => ({
    ...state,
    prefetch: prefetchState,
  }));

  return prefetchState;
}
