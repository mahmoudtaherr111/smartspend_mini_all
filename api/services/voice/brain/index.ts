/**
 * One call's brain: its instructions, its tools, the facts it may say, its drafts and the checks on what the
 * assistant actually said. A new brain is built for every call; its state travels with the call if the call moves
 * to another server.
 */
import { getProfileSnapshot } from "../../finance-semantic-layer";
import type { VoiceWaitDetail } from "../../../../contracts/voice-protocol";
import type { CallBrain, CallIdentity, SpeechCheck } from "../gateway/call-session";
import { DONE_CLAIM_NOTE, DoneClaimCheck } from "./claims";
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
  const claims = new DoneClaimCheck();
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

    waitDetail(calls) {
      const call = calls[0];
      if (!call) return undefined;
      if (call.name === "money_query") return call.args?.metric === "report" ? "report" : "records";
      const byTool: Record<string, VoiceWaitDetail> = {
        memory: "memory", think: "thinking", market_price: "price", app_help: "guide",
        record_draft: "saving", change_draft: "saving", confirm: "saving", cancel: "saving",
      };
      return byTool[call.name];
    },

    async runTool(call, runContext) {
      const tool = tools.get(call.name);
      if (!tool) return { response: { ok: false, error: "unknown_tool" } };
      return tool.run(call.args, context(runContext.identity, runContext.signal));
    },

    onUserWords(text) {
      drafts.heardUser(text);
      validator.noteUserWords(text);
    },

    onAssistantWords(text) {
      // Saying a waiting draft is done is the worse mistake, so it is corrected first.
      // An undo draft talks about what was recorded before, so only new records and actions are checked.
      const waiting = drafts.latestPending();
      const claimed = claims.add(text, Boolean(waiting) && waiting!.kind !== "undo");
      const numbers = check(validator.addAssistantWords(text));
      if (claimed) return { kind: "done_claim_before_confirm", note: DONE_CLAIM_NOTE, incident: { waitingDraft: true } };
      return numbers;
    },

    onTurnEnd() {
      claims.endTurn();
      return check(validator.endTurn());
    },

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
      if (!gate.ok) {
        return {
          card: drafts.card(drafts.get(draftId) ?? draft),
          note: "(ملاحظة من التطبيق: المستخدم ضغط تأكيد على مسودة قديمة أو خلصت صلاحيتها، فماتنفذتش. قوله كده في جملة واعرض تجهزها تاني.)",
        };
      }
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
