import type { IntentResult } from "./types";
import { normalizeForIntent } from "./intent-router";
import { getCapabilityById } from "./capability-registry";

export interface ClarificationState {
  capabilityId: string;
  collectedSlots: Record<string, unknown>;
  missingSlots: string[];
  originalMessage: string;
  attempts: number;
  maxAttempts: number; // default 3
  createdAt: number; // timestamp
  expiresAt: number; // timestamp, default 5 minutes
}

const EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export function createClarificationState(
  capId: string,
  collected: Record<string, unknown>,
  missing: string[],
  originalMessage: string
): ClarificationState {
  const now = Date.now();
  return {
    capabilityId: capId,
    collectedSlots: collected,
    missingSlots: missing,
    originalMessage,
    attempts: 0,
    maxAttempts: 3,
    createdAt: now,
    expiresAt: now + EXPIRY_MS
  };
}

export function isClarificationExpired(state: ClarificationState): boolean {
  return Date.now() > state.expiresAt || state.attempts >= state.maxAttempts;
}

export function isClarificationCancelled(replyMessage: string): boolean {
  const normalized = normalizeForIntent(replyMessage);
  return ["الغاء", "خلاص", "cancel", "تراجع", "ارفض", "امسح"].some(kw => normalized.includes(kw));
}

function extractDigits(text: string): number | undefined {
  // Normalize Eastern Arabic numerals (٠١٢٣٤٥٦٧٨٩) to Western (0123456789)
  const normalized = text
    .replace(/[٠۰]/g, "0")
    .replace(/[١۱]/g, "1")
    .replace(/[٢۲]/g, "2")
    .replace(/[٣۳]/g, "3")
    .replace(/[٤۴]/g, "4")
    .replace(/[٥۵]/g, "5")
    .replace(/[٦۶]/g, "6")
    .replace(/[٧۷]/g, "7")
    .replace(/[٨۸]/g, "8")
    .replace(/[٩۹]/g, "9");

  const match = normalized.match(/\b\d+(\.\d+)?\b/);
  if (match) {
    return parseFloat(match[0]);
  }
  return undefined;
}

function detectArabicPeriod(text: string): string | undefined {
  const normalized = normalizeForIntent(text);
  if (["النهارده", "اليوم", "today"].some(kw => normalized.includes(kw))) return "today";
  if (["امبارح", "yesterday"].some(kw => normalized.includes(kw))) return "yesterday";
  if (["الشهر ده", "الشهر الحالي", "this month"].some(kw => normalized.includes(kw))) return "current_month";
  if (["الشهر اللي فات", "الشهر السابق", "last month"].some(kw => normalized.includes(kw))) return "previous_month";
  if (["الاسبوع", "الاسبوع ده", "this week"].some(kw => normalized.includes(kw))) return "current_week";
  return undefined;
}

export function processClarificationReply(
  state: ClarificationState,
  replyMessage: string
): {
  complete: boolean;
  updatedState: ClarificationState;
  extractedSlots: Record<string, unknown>;
} {
  const extractedSlots: Record<string, unknown> = {};
  const normalizedReply = normalizeForIntent(replyMessage);
  
  // Incremented attempts
  const updatedAttempts = state.attempts + 1;
  const updatedMissing = [...state.missingSlots];

  // Try to extract slots based on what is missing
  for (const slot of state.missingSlots) {
    if (slot === "amount" || slot === "target_amount") {
      const amt = extractDigits(replyMessage);
      if (amt !== undefined) {
        extractedSlots[slot] = amt;
        const index = updatedMissing.indexOf(slot);
        if (index > -1) updatedMissing.splice(index, 1);
      }
    } else if (slot === "period" || slot === "target_date") {
      const period = detectArabicPeriod(replyMessage);
      if (period) {
        extractedSlots[slot] = period;
        const index = updatedMissing.indexOf(slot);
        if (index > -1) updatedMissing.splice(index, 1);
      }
    } else if (slot === "personQuery") {
      // Clean names from reply
      const cleanedName = replyMessage
        .replace(/هو/g, "")
        .replace(/اسم الشخص/g, "")
        .replace(/اسمه/g, "")
        .replace(/لـ/g, "")
        .replace(/على/g, "")
        .trim();
        
      if (cleanedName.length >= 2) {
        extractedSlots[slot] = cleanedName;
        const index = updatedMissing.indexOf(slot);
        if (index > -1) updatedMissing.splice(index, 1);
      }
    }
  }

  const mergedCollected = {
    ...state.collectedSlots,
    ...extractedSlots
  };

  const complete = updatedMissing.length === 0;

  const updatedState: ClarificationState = {
    ...state,
    collectedSlots: mergedCollected,
    missingSlots: updatedMissing,
    attempts: updatedAttempts,
    expiresAt: Date.now() + EXPIRY_MS // prolong expiry on active interaction
  };

  return {
    complete,
    updatedState,
    extractedSlots
  };
}

export function mergeSlotsIntoIntent(intent: IntentResult, extractedSlots: Record<string, unknown>): IntentResult {
  const updatedSlots = {
    ...intent.slots,
    ...extractedSlots
  };

  // Maps some specific slot fields if required
  if (extractedSlots.amount !== undefined) {
    updatedSlots.amount = extractedSlots.amount as number;
  }
  if (extractedSlots.target_amount !== undefined) {
    updatedSlots.amount = extractedSlots.target_amount as number;
  }
  if (extractedSlots.personQuery !== undefined) {
    updatedSlots.personQuery = extractedSlots.personQuery as string;
  }

  return {
    ...intent,
    slots: updatedSlots
  };
}

export function buildClarificationResponse(state: ClarificationState): { question: string; quickReplies: string[] } {
  const cap = getCapabilityById(state.capabilityId);
  if (cap?.clarificationTemplate) {
    return {
      question: cap.clarificationTemplate.question,
      quickReplies: cap.clarificationTemplate.quickReplies,
    };
  }

  const missing = state.missingSlots[0];
  
  if (state.capabilityId === "expense_capture") {
    if (missing === "amount") {
      return {
        question: "تمام، اكتبلي بس المبلغ كام عشان أقدر أسجلك العملية صح.",
        quickReplies: ["٥٠ جنيه مواصلات", "١٥٠ جنيه أكل", "٢٠٠ جنيه سوبرماركت"]
      };
    }
  }

  if (state.capabilityId === "goal_create") {
    if (missing === "amount") {
      return {
        question: "تحب تحوش كام للهدف ده؟ حدد المبلغ.",
        quickReplies: ["٥٠٠٠ جنيه", "١٠٠٠٠ جنيه", "٢٠٠٠٠ جنيه"]
      };
    }
  }

  if (state.capabilityId === "person_spending") {
    if (missing === "personQuery") {
      return {
        question: "مين الشخص اللي تحب أعرفك صرفت عليه كام؟ اكتب اسمه عشان أحسبهولك.",
        quickReplies: ["ماما", "أحمد أخويا", "بابا"]
      };
    }
  }

  // Fallback default message
  return {
    question: "محتاج منك بس توضحلي القيمة أو التفاصيل الناقصة عشان أقدر أساعدك صح.",
    quickReplies: ["إلغاء"]
  };
}
