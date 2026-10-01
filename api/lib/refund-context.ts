/**
 * Money that came back because a purchase was undone.
 *
 * Three stages read the same words three ways: the negation detector sees "كنسلت" and drops the clause, the loan
 * rule sees "رجعولي" and files a loan paid back, the intent detector sees neither and guesses. The words mean one
 * thing when they come together: an order, a booking or a purchase was cancelled or returned (the reversal), and
 * its money came back (the money-back verb). "الأوردر اتلغى ورجعولي 180" and "كنسلت الحجز واستردت 600" are refunds
 * to record, not a cancelled plan and not a loan.
 *
 * Leaf module: it imports nothing from the classifier, so the negation detector, the loan rule and the intent
 * detector can all read it without an import cycle. Every pattern runs on `normalizeArabic` output (ى → ي).
 */
import { parseArabicNumbers } from "./arabic-number-parser";

/** A purchase undone: cancelled, returned, or the order and booking words that go with it. */
const REVERSAL =
  /(?:^|\s)[وف]?(?:اتلغي|اتلغت|اتلغا|لغيت|لغيته|لغيتها|لغوا|لغوه|لغوها|الغيت|ألغيت|كنسلت|كنسلته|كنسلتها|اتكنسل|اتكنسلت|كنسلوا|كنسلوه|رجعت|رجعنا|رجعته|رجعتها|المرتجع|مرتجع)(?=\s|$)/;

/** The money coming back. */
const MONEY_BACK =
  /(?:^|\s)[وف]?(?:استرجعت|استرجعنا|استرديت|استردت|استردينا|رجعولي|رجعوالي|رجعلي|رجعتلي|ردولي|ردوا|رجعوا|رجعوه|رجعوها)(?=\s|$)/;

/** A thing returned to its seller, rather than returning home or repaying a person. */
const RETURN_TO_SELLER =
  /(?:^|\s)[وف]?(?:رجعت|رجعنا|رجعته|رجعتها)\s+(?:\S+\s+){0,5}(?:للمحل|للمتجر|للبائع|للبايع|للبياع|للموقع|للمندوب)(?=\s|$)/;
const RECEIVED_MONEY =
  /(?:^|\s)[وف]?(?:خدت|اخدت|استلمت)\s+(?:\d|فلوس|الفلوس|تمن|حق)|(?:^|\s)[وف]?(?:خدت|اخدت|استلمت)\s*$/;

/** Whether normalized text says a purchase was undone and its money came back. */
export function readsAsReversalRefund(norm: string): boolean {
  return (
    REVERSAL.test(norm) &&
    (MONEY_BACK.test(norm) ||
      (RETURN_TO_SELLER.test(norm) &&
        RECEIVED_MONEY.test(parseArabicNumbers(norm))))
  );
}

/**
 * Whether normalized text holds a money-back verb: something was paid back, not only cancelled. The amount is not
 * required here, because the rule engine checks the words around an amount without the amount itself.
 */
export function saysMoneyCameBack(norm: string): boolean {
  // "استرجعت الاوردر" took the order back; only "استرجعت 250" or "استرجعت فلوسي" took money back.
  return MONEY_BACK.test(norm.replace(ORDER_TAKEN_BACK, " "));
}

/** A take-back verb whose object is the order or booking itself, not money. */
const ORDER_TAKEN_BACK = /(?:^|\s)[وف]?(?:استرجعت|استرجعنا|رجعت|رجعنا)\s+(?:ال)?(?:اوردر|طلب|طلبيه|حجز|شحنه)(?=\s|$)/g;
