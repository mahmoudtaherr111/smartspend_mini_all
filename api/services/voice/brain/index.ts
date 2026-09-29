/**
 * One call's brain: its instructions, its tools, the facts it may say, its drafts and the checks on what the
 * assistant actually said. A new brain is built for every call; its state travels with the call if the call moves
 * to another server.
 */
import { randomBytes } from "crypto";
import { getProfileSnapshot } from "../../finance-semantic-layer";
import type { VoiceWaitDetail } from "../../../../contracts/voice-protocol";
import type { CallBrain, CallIdentity, SpeechCheck } from "../gateway/call-session";
import { DONE_CLAIM_NOTE, DoneClaimCheck, FAILURE_CLAIM_NOTE, FailureClaimCheck } from "./claims";
import { DraftBook } from "./drafts";
import { FactLedger } from "./facts";
import { buildCoachInstruction } from "./coach-instructions";
import { buildInstruction, openingNote } from "./instructions";
import { markAsked } from "./profile-questions";
import { loadCallSnapshot } from "./snapshot";
import { appHelpTool } from "./tools/app-help";
import { calculateTool } from "./tools/calculate";
import { marketPriceTool } from "./tools/market-price";
import { memoryTool } from "./tools/memory";
import { moneyQuery } from "./tools/money-query";
import { cancelTool, changeDraftTool, confirmTool, dropRuntimeAction, executeDraft, RECORDS_CHANGED_SAY, recordDraftTool } from "./tools/record";
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

/**
 * The coach call's tools: no text model judges for it; the live model reasons and every sum is `calculate`.
 */
export const COACH_TOOLS: VoiceTool[] = [
  moneyQuery,
  calculateTool,
  recordDraftTool,
  changeDraftTool,
  confirmTool,
  cancelTool,
  memoryTool,
  appHelpTool,
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
  const failures = new FailureClaimCheck();
  const openClarifications: number[] = [];
  const toolMap = (list: VoiceTool[]) => new Map(list.map((tool) => [tool.declaration.name, tool]));
  let tools = toolMap(options.tools ?? VOICE_TOOLS);
  let salaryDay: Promise<number | undefined> | null = null;
  const records: { seen: number | null } = { seen: null };
  /** The call's own mark on the app's notes, unknown to the user (never sent to the app, never spoken). */
  let noteTag = `#${randomBytes(3).toString("hex")}`;

  const context = (identity: CallIdentity, signal: AbortSignal): ToolContext => ({
    identity,
    ledger,
    drafts,
    app: options.app,
    signal,
    now,
    openClarifications,
    records,
    salaryDay: () => (salaryDay ??= getProfileSnapshot({ userId: identity.userId, userType: identity.userType })
      .then((profile) => profile.salaryDay)
      .catch(() => undefined)),
  });

  const check = (mismatch: Mismatch | null): SpeechCheck | null => {
    if (!mismatch) return null;
    if (mismatch.stale) return { kind: "stale_number", note: null, incident: { spoken: mismatch.spoken } };
    return {
      note: validator.shouldCorrect(mismatch) ? correctionNote(mismatch) : null,
      // Numbers only: which figure was said and which it should have been, never the sentence.
      incident: { spoken: mismatch.spoken, intended: mismatch.intended?.value ?? null },
    };
  };

  return {
    async prepare(identity, callOptions) {
      const coach = callOptions.coach === true;
      tools = toolMap(options.tools ?? (coach ? COACH_TOOLS : VOICE_TOOLS));
      const snapshot = await loadCallSnapshot(identity, ledger, now(), { refs: coach });
      if (snapshot.question) await markAsked(identity.userId, identity.userType, now()).catch(() => undefined);
      const voiceGender = VOICE_CHOICES[callOptions.voiceName]?.gender ?? "female";
      return {
        instruction: coach
          ? buildCoachInstruction({ snapshot, voiceGender, noteTag })
          : buildInstruction({ snapshot, voiceGender, noteTag }),
        tools: [...tools.values()].map((tool) => tool.declaration),
      };
    },

    openingNote,

    appNote(text) {
      const inner = text.replace(/^\(ملاحظة من التطبيق[^:]*:\s*/, "").replace(/\)\s*$/, "");
      return `(ملاحظة من التطبيق ${noteTag}: ${inner})`;
    },

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

    writes: (name) => name === "confirm",

    async runTool(call, runContext) {
      const tool = tools.get(call.name);
      if (!tool) {
        failures.toolAnswered(false);
        return { response: { ok: false, error: "unknown_tool" } };
      }
      // A tool the call stopped (its time ran out) failed as far as the user's request goes.
      runContext.signal.addEventListener("abort", () => failures.toolAnswered(false), { once: true });
      try {
        const outcome = await tool.run(call.args, context(runContext.identity, runContext.signal));
        if (!runContext.signal.aborted) failures.toolAnswered(outcome.response.ok !== false || !/^tool_|unavailable|failed/.test(String(outcome.response.error ?? "")));
        return outcome;
      } catch (error) {
        failures.toolAnswered(false);
        throw error;
      }
    },

    onUserWords(text) {
      failures.newRequest();
      drafts.heardUser(text);
      validator.noteUserWords(text);
    },

    onAssistantWords(text) {
      // The assistant speaking after a draft was made is it being read out: a spoken yes counts from here.
      drafts.heardAssistant();
      // Saying a waiting draft is done is the worse mistake, so it is corrected first.
      // An undo draft talks about what was recorded before, so only new records and actions are checked.
      const waiting = drafts.latestPending();
      const claimed = claims.add(text, Boolean(waiting) && waiting!.kind !== "undo");
      const failure = failures.add(text);
      const numbers = check(validator.addAssistantWords(text));
      if (claimed) return { kind: "done_claim_before_confirm", note: DONE_CLAIM_NOTE, incident: { waitingDraft: true } };
      if (failure) {
        return {
          kind: "failure_claim_without_tool",
          note: failure.retry ? FAILURE_CLAIM_NOTE : null,
          incident: { toolsCalled: failure.toolsCalled, retried: failure.retry },
        };
      }
      return numbers;
    },

    onTurnEnd() {
      claims.endTurn();
      failures.endTurn();
      return check(validator.endTurn());
    },

    async onCardAction(action, draftId, identity) {
      const draft = drafts.get(draftId);
      if (!draft) return null;
      if (action === "cancel") {
        if (draft.status !== "pending") return null;
        drafts.settle(draftId, "cancelled");
        await dropRuntimeAction(draft, { identity });
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
          ? `(ملاحظة من التطبيق: المستخدم أكد من الشاشة واتعمل: ${result.message}. قول ده في جملة قصيرة. ${RECORDS_CHANGED_SAY})`
          : "(ملاحظة من التطبيق: المستخدم أكد من الشاشة بس العملية ماتمتش. قول كده بوضوح واعرض تحاول تاني.)",
      };
    },

    awaitingConfirmation: () => drafts.awaiting(),

    summary: () => drafts.summary(),

    snapshot: () => ({
      ledger: ledger.snapshot(),
      drafts: drafts.snapshot(),
      openClarifications: [...openClarifications],
      noteTag,
      recordsSeen: records.seen,
      failureRetries: failures.snapshot(),
    }),

    restore(state) {
      const saved = (state ?? {}) as {
        ledger?: Parameters<FactLedger["restore"]>[0];
        drafts?: Parameters<DraftBook["restore"]>[0];
        openClarifications?: number[];
        noteTag?: string;
        recordsSeen?: number | null;
        failureRetries?: { retries?: number };
      };
      ledger.restore(saved.ledger);
      drafts.restore(saved.drafts);
      openClarifications.splice(0, openClarifications.length, ...(saved.openClarifications ?? []));
      if (saved.noteTag) noteTag = saved.noteTag;
      records.seen = saved.recordsSeen ?? null;
      failures.restore(saved.failureRetries);
    },
  };
}
