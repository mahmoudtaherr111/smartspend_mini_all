/**
 * One call's brain: its instructions, its tools, the facts it may say, its drafts and the checks on what the
 * assistant actually said. A new brain is built for every call; its state travels with the call if the call moves
 * to another server.
 */
import { getProfileSnapshot } from "../../finance-semantic-layer";
import type { CallBrain, CallIdentity, SpeechCheck } from "../gateway/call-session";
import { DraftBook } from "./drafts";
import { FactLedger } from "./facts";
import { buildInstruction, openingNote } from "./instructions";
import { loadCallSnapshot } from "./snapshot";
import { appHelpTool } from "./tools/app-help";
import { marketPriceTool } from "./tools/market-price";
import { memoryTool } from "./tools/memory";
import { moneyQuery } from "./tools/money-query";
import { cancelTool, changeDraftTool, confirmTool, executeDraft, recordDraftTool } from "./tools/record";
import { thinkTool } from "./tools/think";
import type { ToolContext, VoiceAppCalls, VoiceTool } from "./tools/types";
import { correctionNote, SpokenNumberValidator, type Mismatch } from "./validator";
import { VOICE_CHOICES } from "./voices";

export type { VoiceAppCalls } from "./tools/types";

export const VOICE_TOOLS: VoiceTool[] = [
  moneyQuery,
  recordDraftTool,
  changeDraftTool,
  confirmTool,
  cancelTool,
  memoryTool,
  appHelpTool,
  thinkTool,
  marketPriceTool,
];

export interface BrainOptions {
  app: VoiceAppCalls;
  now?: () => Date;
  tools?: VoiceTool[];
}

export function createCallBrain(options: BrainOptions): CallBrain {
  const now = options.now ?? (() => new Date());
  const ledger = new FactLedger();
  const drafts = new DraftBook(() => now().getTime());
  const validator = new SpokenNumberValidator(ledger);
  const openClarifications: number[] = [];
  const tools = new Map((options.tools ?? VOICE_TOOLS).map((tool) => [tool.declaration.name, tool]));
  let salaryDay: Promise<number | undefined> | null = null;

  const context = (identity: CallIdentity, signal: AbortSignal): ToolContext => ({
    identity,
    ledger,
    drafts,
    app: options.app,
    signal,
    now,
    openClarifications,
    salaryDay: () => (salaryDay ??= getProfileSnapshot({ userId: identity.userId, userType: identity.userType })
      .then((profile) => profile.salaryDay)
      .catch(() => undefined)),
  });

  const check = (mismatch: Mismatch | null): SpeechCheck | null => {
    if (!mismatch) return null;
    return {
      note: validator.shouldCorrect(mismatch) ? correctionNote(mismatch) : null,
      // Numbers only: which figure was said and which it should have been, never the sentence.
      incident: { spoken: mismatch.spoken, intended: mismatch.intended?.value ?? null },
    };
  };

  return {
    async prepare(identity, callOptions) {
      const snapshot = await loadCallSnapshot(identity, ledger, now());
      const voiceGender = VOICE_CHOICES[callOptions.voiceName]?.gender ?? "female";
      return {
        instruction: buildInstruction({ snapshot, voiceGender }),
        tools: [...tools.values()].map((tool) => tool.declaration),
      };
    },

    openingNote,

    async runTool(call, runContext) {
      const tool = tools.get(call.name);
      if (!tool) return { response: { ok: false, error: "unknown_tool" } };
      return tool.run(call.args, context(runContext.identity, runContext.signal));
    },

    onUserWords(text) {
      drafts.heardUser(text);
      validator.noteUserWords(text);
    },

    onAssistantWords: (text) => check(validator.addAssistantWords(text)),

    onTurnEnd: () => check(validator.endTurn()),

    async onCardAction(action, draftId, identity) {
      const draft = drafts.get(draftId);
      if (!draft) return null;
      if (action === "cancel") {
        if (draft.status !== "pending") return null;
        drafts.settle(draftId, "cancelled");
        return {
          card: drafts.card(draft),
          note: "(ملاحظة من التطبيق: المستخدم لغى المسودة من الشاشة. قول إنها اتلغت في كلمتين.)",
        };
      }
      const gate = drafts.gate(draftId, true);
      if (!gate.ok) return null;
      const result = await executeDraft(gate.draft, context(identity, new AbortController().signal));
      return {
        card: drafts.card(drafts.get(draftId)!),
        note: result.ok
          ? `(ملاحظة من التطبيق: المستخدم أكد من الشاشة واتعمل: ${result.message}. قول ده في جملة قصيرة.)`
          : "(ملاحظة من التطبيق: المستخدم أكد من الشاشة بس العملية ماتمتش. قول كده بوضوح واعرض تحاول تاني.)",
      };
    },

    awaitingConfirmation: () => drafts.awaiting(),

    summary: () => drafts.summary(),

    snapshot: () => ({ ledger: ledger.snapshot(), drafts: drafts.snapshot(), openClarifications: [...openClarifications] }),

    restore(state) {
      const saved = (state ?? {}) as {
        ledger?: Parameters<FactLedger["restore"]>[0];
        drafts?: Parameters<DraftBook["restore"]>[0];
        openClarifications?: number[];
      };
      ledger.restore(saved.ledger);
      drafts.restore(saved.drafts);
      openClarifications.splice(0, openClarifications.length, ...(saved.openClarifications ?? []));
    },
  };
}
