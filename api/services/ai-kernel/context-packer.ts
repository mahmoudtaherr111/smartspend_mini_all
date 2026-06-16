import type { AIChannel, AIRequest, ContextPack, ContextSection, DataNeed, IntentResult, TokenBudget } from "./types";
import { resolveAICostPolicy } from "../ai-cost-policy";

export function estimateTokens(value: string): number {
  if (!value.trim()) return 0;
  return Math.ceil(value.length / 3.5);
}

function summarizeDataNeeds(dataNeeds: DataNeed[]): string {
  return dataNeeds
    .map((need) => {
      const scope = need.scope
        ? Object.entries(need.scope)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => `${key}=${String(value)}`)
            .join(",")
        : "";
      return `${need.id}:${need.kind}:${need.priority}${scope ? `(${scope})` : ""}`;
    })
    .join("\n");
}

function recentHistory(request: AIRequest, tokenBudget: number): string {
  const history = request.conversationHistory ?? [];
  const lines: string[] = [];
  let usedTokens = 0;

  for (const item of history.slice().reverse()) {
    const line = `${item.role}: ${item.content}`;
    const lineTokens = estimateTokens(line);
    if (usedTokens + lineTokens > tokenBudget) break;
    lines.unshift(line);
    usedTokens += lineTokens;
  }

  return lines.join("\n");
}

export function getTokenBudget(
  channel: AIChannel,
  plan = "free",
  intentKind?: IntentResult["kind"],
): TokenBudget {
  return resolveAICostPolicy({ channel, plan, intentKind });
}

export function buildContextPack(
  request: AIRequest,
  intent: IntentResult,
  dataNeeds: DataNeed[],
): ContextPack {
  const tokenBudget = getTokenBudget(request.channel, request.userPlan, intent.kind);
  const sections: ContextSection[] = [
    {
      name: "guardrails",
      priority: "hot",
      tokenBudget: 80,
      content: "Use resolved facts for money numbers. Do not execute actions without explicit confirmation.",
    },
    {
      name: "intent",
      priority: "hot",
      tokenBudget: 90,
      content: `kind=${intent.kind}; confidence=${intent.confidence}; reason=${intent.reason}; period=${intent.slots.period ?? "none"}; category=${intent.slots.category ?? "none"}`,
    },
    {
      name: "facts",
      priority: "hot",
      tokenBudget: tokenBudget.maxFactTokens,
      content: summarizeDataNeeds(dataNeeds),
    },
  ];

  const historyContent = recentHistory(request, tokenBudget.maxHistoryTokens);
  if (historyContent) {
    sections.push({
      name: "history",
      priority: "normal",
      tokenBudget: tokenBudget.maxHistoryTokens,
      content: historyContent,
    });
  }

  const estimatedInputTokens = sections.reduce((sum, section) => sum + estimateTokens(section.content), 0);

  return {
    channel: request.channel,
    tokenBudget,
    estimatedInputTokens,
    sections,
    dataNeeds,
  };
}
