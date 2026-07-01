import type {
  AIChannel,
  AIResponse,
  ActionDraft,
  Artifact,
  ContextPack,
  DataNeed,
  IntentResult,
  ResolvedFact,
  ResponseRecipe,
  TokenBudget,
} from "./types";

export interface NormalizeAIResponseInput {
  traceId: string;
  channel: AIChannel;
  content?: string;
  intent: IntentResult;
  dataNeeds: DataNeed[];
  contextPack: ContextPack;
  facts?: ResolvedFact[];
  artifacts?: Artifact[];
  actions?: ActionDraft[];
  proposedActions?: ActionDraft[];
  recipe?: ResponseRecipe;
  model?: string;
  tokensUsed?: number;
  tokenBudget?: TokenBudget;
  debug?: Record<string, unknown>;
}

export const AI_RESPONSE_SCHEMA_VERSION = 2;

export function normalizeAIResponse(input: NormalizeAIResponseInput): AIResponse {
  return {
    traceId: input.traceId,
    channel: input.channel,
    content: input.content ?? "",
    intent: input.intent,
    dataNeeds: input.dataNeeds,
    facts: input.facts ?? [],
    artifacts: input.artifacts ?? [],
    actions: input.actions ?? [],
    proposedActions: input.proposedActions,
    recipe: input.recipe,
    tokenBudget: input.tokenBudget ?? input.contextPack.tokenBudget,
    model: input.model,
    tokensUsed: input.tokensUsed,
    debug: {
      ...(input.debug ?? {}),
      responseSchemaVersion: AI_RESPONSE_SCHEMA_VERSION,
    },
  };
}
