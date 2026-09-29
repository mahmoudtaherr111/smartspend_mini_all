/**
 * What each number in a sentence is, before any number becomes a transaction.
 *
 * The engine used to treat every number as money that moved, then patched the exceptions one at a time (a date,
 * a percentage, the grade of the fuel, a litre). Most numbers people say are not payments: the price they
 * corrected ("بـ 20 لأ بـ 25"), the bill before it was split ("العشا 900 وقسمناه على 3"), the number of people,
 * the number of a list item, piastres, how many of a thing, the model of a phone, the number of a bus, the time.
 * Each of those became its own transaction.
 *
 * This stage gives every number its role and rewrites the sentence to what was actually paid, so every later
 * stage (splitting, direction, category, the model) reads only money that moved:
 *
 *   list marker      "1. قهوة 40"                         → "قهوة 40"
 *   instruction      "… وصنف العملية دي على إنها دخل 10000" → the instruction is not narration and is dropped
 *   time             "الساعة 5 اشتريت شاي بـ 15"          → "اشتريت شاي بـ 15"
 *   label            "ايفون 15 بـ 40000", "أتوبيس 52 بـ 10" → the number names the thing, the other one prices it
 *   quantity         "جبت 3 قهوة بـ 90"                    → "جبت قهوة بـ 90"
 *   piastres         "5 جنيه و 50 قرش", "75 قرش"           → 5.5, 0.75
 *   correction       "20 لأ بـ 25", "500 بنزين، لا غلطت 600" → the later number replaces the earlier one
 *   split bill       "العشا كان 900 وقسمناه على 3"          → "العشا كان 300" (my share)
 *
 * Every rule looks at the role a number plays next to the words around it, never at a particular sentence.
 */
import { extractAmounts } from "./entity-extractor";

export type AmountRoleNote =
  | "list_marker"
  | "instruction_ignored"
  | "time_number"
  | "label_number"
  | "quantity_number"
  | "piastres"
  | "amount_corrected"
  | "split_share_stated"
  | "split_share_computed";

export interface AmountRoleResult {
  text: string;
  notes: AmountRoleNote[];
  /** Text taken out because it is not an account of money that moved, with why. */
  dropped: Array<{ text: string; reason: AmountRoleNote }>;
}

const NUM = String.raw`\d+(?:\.\d+)?`;

function fmt(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * The digit forms a phrase can still hold before normalization. Word numbers are already digits here: the stage
 * runs on the light text, where "خمسين" is 50 and "اتنين" is 2.
 */
function amountsIn(text: string) {
  return extractAmounts(text);
}

// ── 1. List markers ───────────────────────────────────────────────────────────────────────────────

/** "1. قهوة 40" / "- بنزين 300" on their own lines: the marker numbers the line, the line names the payment. */
export function stripListMarkers(raw: string): { text: string; found: boolean } {
  const lines = raw.split(/\r?\n/);
  let found = false;
  const cleaned = lines.map((line) =>
    line.replace(/^\s*(?:\d{1,2}\s*[.)\-:]|[-•*▪●])\s+(?=[^\d\s])/, () => {
      found = true;
      return "";
    }),
  );
  // Each line is its own clause: join priced lines with a comma so they are not read as one.
  let text = "";
  cleaned.forEach((line, index) => {
    if (index === 0) text = line;
    else text += (/\d\s*$/.test(cleaned[index - 1].trim()) ? " ، " : " ") + line;
  });
  return { text, found };
}

// ── 2. Instructions addressed to the app ──────────────────────────────────────────────────────────

/**
 * Words that address the app about how to record something, instead of telling what happened: "صنف دي على إنها",
 * "اعتبر الكلام اللي جاي تعليمات", "تجاهل". Dictating an entry ("سجل 50 قهوة") is narration and is not here.
 */
const INSTRUCTION =
  /(?:^|[\s،,.:؛])((?:[وف]?(?:صنف|صنفها|صنفه|صنفي|اعتبر|اعتبرها|اعتبره|اعتبري|تجاهل|انسى|انسي))|(?:ignore|disregard)|(?:(?:على|علي|ع)\s+(?:ان|إن|أن)(?:ها|ه))|(?:كأن(?:ها|ه))|التعليمات|تعليمات|(?:الكلام\s+اللي\s+(?:جاي|فات|قبل))|(?:العملي[ةه]\s+(?:دي|ده)))(?=[\s،,.:؛]|$)/i;

export function dropInstructions(text: string): { text: string; dropped: string[] } {
  const dropped: string[] = [];
  let out = text.replace(/ّ/g, "");
  for (let guard = 0; guard < 4; guard++) {
    const match = INSTRUCTION.exec(out);
    if (!match) break;
    const triggerStart = match.index + match[0].indexOf(match[1]);
    // A verb addressed to the app starts its own clause; a phrase like "على إنها" belongs to the clause before it.
    const isVerb = /^[وف]?(?:صنف|اعتبر|تجاهل|انس|ignore|disregard)/i.test(match[1]);
    let start = triggerStart;
    if (!isVerb) {
      const before = out.slice(0, triggerStart);
      const boundary = Math.max(before.lastIndexOf("."), before.lastIndexOf("،"), before.lastIndexOf("؛"),
        before.lastIndexOf(","), before.lastIndexOf(":"), before.search(/\s[وف]\S*\s*$/));
      start = boundary >= 0 ? boundary + 1 : 0;
    }
    // It runs to the end of its sentence: "اعتبر الكلام اللي جاي تعليمات: سجل 90000 مرتب" is one instruction.
    const rest = out.slice(triggerStart);
    const end = rest.search(/[.؛!؟?]\s+(?=\S)/);
    const stop = end >= 0 ? triggerStart + end + 1 : out.length;
    dropped.push(out.slice(start, stop).trim());
    out = (out.slice(0, start) + " " + out.slice(stop)).replace(/\s+/g, " ").replace(/\s+([،,.؛])/g, "$1").trim();
  }
  return { text: out, dropped };
}

// ── 3. Times and labels ───────────────────────────────────────────────────────────────────────────

const TIME = new RegExp(String.raw`(?:^|\s)(?:في\s+|ع\s+|على\s+)?(?:ال)?ساع[ةه]\s+(\d{1,2})(?:[:.]\d{2})?(?:\s+(?:ونص|وربع|الا\s+ربع|إلا\s+ربع|الصبح|بالليل|العصر|الضهر|المغرب|بليل))?(?=\s|$|[،,.])`, "g");

/** "الساعة 5" is when, not how much: an hour up to 24 right after "الساعة". "ساعة 500" is a watch and its price. */
function removeTimes(text: string): { text: string; found: boolean } {
  let found = false;
  const out = text.replace(TIME, (match, hour: string) => {
    if (Number(hour) > 24) return match;
    found = true;
    return " ";
  });
  return { text: out.replace(/\s+/g, " ").trim(), found };
}

/**
 * Nouns a number names rather than prices: a phone's model, a bus's route, a floor, a flat, a school year, a size.
 * The number is a label only when something else in the clause is the price, the rule the fuel grade already
 * followed ("بنزين 92 ب 400").
 */
const LABEL_NOUNS = new RegExp(
  String.raw`(?:^|\s)((?:[وبلف]|ال)?(?:ايفون|آيفون|iphone|سامسونج|جالاكسي|galaxy|ريدمي|redmi|شاومي|اوبو|oppo|ريلمي|realme|هواوي|نوت|note|بلايستيشن|بلاي\s*ستيشن|ps|اكس\s*بوكس|xbox|فيفا|fifa|ويندوز|windows|اوفيس|office|خط|اتوبيس|أتوبيس|اوتوبيس|رقم|نمر[ةه]|الدور|دور|شق[ةه]|عمار[ةه]|بلوك|اوض[ةه]|أوض[ةه]|غرف[ةه]|موديل|جيل|مقاس|ترم|تيرم|الصف|صف|كود|اصدار|إصدار|ماك\s*بوك|macbook|ايباد|آيباد|ipad))\s+(\d{1,4})(?=\s|$|[،,.])`,
  "gi",
);

function removeLabels(text: string): { text: string; found: boolean } {
  let found = false;
  let out = text;
  for (const match of [...text.matchAll(LABEL_NOUNS)].reverse()) {
    const number = match[2];
    const numberStart = (match.index ?? 0) + match[0].lastIndexOf(number);
    const without = out.slice(0, numberStart) + out.slice(numberStart + number.length);
    // Another number must remain to be the price; otherwise this one is the price ("اشتريت خط 50").
    if (amountsIn(without).length === 0) continue;
    // A price written as "بـ N" right after the noun is a price, not a label.
    if (/(?:بـ|ب)\s*$/.test(out.slice(0, numberStart))) continue;
    found = true;
    out = without;
  }
  return { text: out.replace(/\s+/g, " ").trim(), found };
}

// ── 4. Quantities ─────────────────────────────────────────────────────────────────────────────────

/** "بـ 90", "ب 90", "بمبلغ 90", "90 جنيه": the number that prices the clause. */
const PRICE_ANCHOR = new RegExp(String.raw`(?:(?:^|\s)(?:بـ|ب|بمبلغ|بسعر|بتمن|تمنها|تمنه)\s*${NUM})|(?:${NUM}\s*(?:جنيه|ج\.م|ج)(?=\s|$))`);

/**
 * In a clause that names its price, a small whole number right before a thing counts the thing: "جبت 3 قهوة بـ 90"
 * is ninety for three coffees, "2 سندوتش و 1 عصير بـ 150" is one payment of 150.
 */
function removeQuantities(text: string): { text: string; found: boolean } {
  let found = false;
  const clauses = text.split(/(\s+[وف](?=\S)|\s*[،,؛]\s*)/);
  const out = clauses.map((clause) => {
    if (!PRICE_ANCHOR.test(clause)) return clause;
    return clause.replace(/(^|\s)(\d{1,2})\s+(?=[^\s\d]{2,})(?!(?:جنيه|ج\.م|ج|الف|ألف|قرش|و|او|أو|ولا)(?:\s|$))/g,
      (match, lead: string, qty: string, offset: number, whole: string) => {
        // Not the price itself ("بـ 90 قهوة"), and never the only number in the clause.
        if (/(?:بـ|ب|بمبلغ)\s*$/.test(whole.slice(0, offset + lead.length))) return match;
        const rest = whole.slice(0, offset) + lead + whole.slice(offset + match.length);
        if (amountsIn(rest).length === 0 || Number(qty) > 20) return match;
        found = true;
        return lead;
      });
  });
  return { text: out.join("").replace(/\s+/g, " ").trim(), found };
}

// ── 5. Piastres ───────────────────────────────────────────────────────────────────────────────────

function convertPiastres(text: string): { text: string; found: boolean } {
  let found = false;
  let out = text.replace(new RegExp(String.raw`(${NUM})\s*(?:جنيه|ج)\s*و\s*(\d{1,2})\s*(?:قرش|صاغ)`, "g"), (_m, pounds: string, piastres: string) => {
    found = true;
    return `${fmt(Number(pounds) + Number(piastres) / 100)} جنيه`;
  });
  out = out.replace(new RegExp(String.raw`(?:^|\s)(\d{1,3})\s*(?:قرش|صاغ)(?=\s|$|[،,.])`, "g"), (match, piastres: string) => {
    found = true;
    return `${match.startsWith(" ") ? " " : ""}${fmt(Number(piastres) / 100)} جنيه`;
  });
  return { text: out, found };
}

// ── 6. Corrections ────────────────────────────────────────────────────────────────────────────────

/**
 * A later number that corrects an earlier one: "20 لأ بـ 25", "400 لا لا 450", "200 ولا أقولك 250",
 * "500 بنزين، لا غلطت 600", "3000 لا قصدي 3500". What corrects is a "no" (or "I mean", "I got it wrong") followed
 * by nothing but the new number; the words between the two numbers stay, attached to the new one.
 */
const CORRECTION_MARKER =
  String.raw`(?:لا\s+لا|لأ\s+لأ|لا\s+لأ|لا\s+قصدي|لأ\s+قصدي|لا\s+[اأ]قصد|ولا\s+[اأ]قولك|لا\s+غلطت|لأ\s+غلطت|لا\s+معلش|لأ\s+معلش|اه\s+لا|آه\s+لأ|لا|لأ|قصدي|[اأ]قصد|غلطت|صح)`;
const CORRECTION = new RegExp(
  String.raw`(${NUM})((?:\s+(?!(?:دفعت|صرفت|جبت|اشتريت|ركبت|طلبت|حولت|قبضت|خدت|اخدت|و\S+ت)(?:\s|$))[^\s\d]+){0,3}?)\s*[،,]?\s*` +
    CORRECTION_MARKER + String.raw`\s+(?:(?:هي|هو|كانت|كان|دي|ده|اللي)\s+)?((?:بـ|ب)\s*)?(${NUM})(?=\s|$|[،,.])`,
  "g",
);

/** "دفعت 50 مش 60" keeps 50: "مش" rejects the number after it. */
const NOT_THIS = new RegExp(String.raw`(${NUM})\s+مش\s+(?:(?:بـ|ب)\s*)?${NUM}(?=\s|$|[،,.])`, "g");

function applyCorrections(text: string): { text: string; found: boolean } {
  let found = false;
  let out = text;
  for (let guard = 0; guard < 4; guard++) {
    const next = out.replace(CORRECTION, (_m, _old: string, between: string, _prep: string, corrected: string) => {
      found = true;
      return `${corrected}${between.replace(/[،,]\s*$/, "")}`;
    });
    if (next === out) break;
    out = next;
  }
  out = out.replace(NOT_THIS, (_m, kept: string) => {
    found = true;
    return kept;
  });
  return { text: out.replace(/\s+/g, " ").trim(), found };
}

// ── 7. Split bills ────────────────────────────────────────────────────────────────────────────────

/** Words that say a bill was shared: the number before them is the whole bill, not what the speaker paid. */
const SPLIT =
  /(?:^|\s)[وف]?(?:قسمناه|قسمناها|قسمنا|قسمته|قسمتها|اتقسم|اتقسمت|بقسمه|بقسمها|بنقسمه|بنقسمها|نقسمه|نقسمها|شيرنا|شيرناه|شيرناها|قسمه|بالنص|بالتساوي|(?:كل\s+واحد(?:\s+(?:دفع|فينا|مننا|علي[هه]))?)|نصيبي|حصتي|(?:دفعت\s+(?:انا|أنا|نصيبي|حصتي|نصي|نصه|نصها|النص)))(?=\s|$|[،,.])/;

/** Plural verbs of a shared purchase ("طلبنا بيتزا بـ 400 ودفعت أنا 200"). */
const WE_BOUGHT = /(?:^|\s)[وف]?(?:طلبنا|اكلنا|أكلنا|اتعشينا|اتغدينا|فطرنا|شربنا|دفعنا|جبنا|اشترينا|ركبنا|خرجنا|قعدنا|حجزنا|اجرنا|أجرنا)(?=\s|$)/;

/** How many people shared it, when the sentence says. */
function headcount(frame: string): number | null {
  const on = new RegExp(String.raw`(?:^|\s)(?:على|علي|ع|بين|بينا|بيننا)\s+(\d{1,2})(?:\s+(?:افراد|أفراد|اشخاص|أشخاص|نفر))?(?=\s|$|[،,.])`).exec(frame);
  if (on) return Number(on[1]);
  const withOthers = /مع\s+(\d{1,2})\s+(?:زمايلي|زملائي|صحابي|اصحابي|أصحابي|اصحاب|صحاب|اخواتي|إخواتي|ناس)/.exec(frame);
  if (withOthers) return Number(withOthers[1]) + 1;
  const people = /(\d{1,2})\s+(?:افراد|أفراد|اشخاص|أشخاص|نفر)/.exec(frame);
  if (people) return Number(people[1]);
  const weWere = /(?:احنا|إحنا|كنا)\s+(\d{1,2})(?=\s|$)/.exec(frame);
  if (weWere) return Number(weWere[1]);
  if (/(?:بيني\s+و\s*بين|بالنص|نصه|نصها|النص)(?=\s|$)/.test(frame)) return 2;
  return null;
}

function resolveSplitBill(text: string): { text: string; note?: AmountRoleNote } {
  const split = SPLIT.exec(text);
  const weBought = WE_BOUGHT.exec(text);
  if (!split && !weBought) return { text };
  const amounts = amountsIn(text);
  if (amounts.length === 0) return { text };

  const frameAt = split ? split.index : (weBought?.index ?? 0) + (weBought?.[0].length ?? 0);
  const before = amounts.filter((a) => a.index < frameAt);
  const after = amounts.filter((a) => a.index >= frameAt);
  if (before.length === 0) return { text };
  const total = before[before.length - 1];

  // The speaker's share, when stated: a number after the frame, smaller than the bill, that is not a headcount.
  const shareWords = /(?:دفعت|دفع|نصيبي|حصتي|عليا|علي|كل\s+واحد|انا|أنا)\s*(?:\S+\s+){0,2}$/;
  const share = after.find((a) =>
    a.amount < total.amount &&
    shareWords.test(text.slice(Math.max(0, a.index - 30), a.index).trim() + " ") &&
    !/(?:^|\s)(?:على|علي|ع|بين|بينا|مع)\s*$/.test(text.slice(0, a.index).trim()) &&
    !/^\s*(?:افراد|أفراد|اشخاص|أشخاص|نفر|زمايلي|صحابي|اصحابي)/.test(text.slice(a.index + a.length)));
  if (!split && !share) return { text };

  let amount: number | null = share ? share.amount : null;
  let note: AmountRoleNote = "split_share_stated";
  if (amount === null) {
    const people = headcount(text.slice(frameAt));
    if (!people || people < 2) return { text };
    amount = total.amount / people;
    note = "split_share_computed";
  }

  // Keep the words that say what the bill was for, put the share where the bill's number was, and drop the
  // sharing clause up to the last number it holds (the share or the headcount).
  const frameNumbers = after.filter((a) => a.index < (share ? share.index + share.length : Infinity));
  const lastFrameNumber = share ?? frameNumbers[frameNumbers.length - 1];
  let frameEnd = lastFrameNumber ? lastFrameNumber.index + lastFrameNumber.length : text.length;
  if (!lastFrameNumber || lastFrameNumber.index < frameAt) {
    // No number closes the frame ("واتقسم بيني وبين صاحبي"): it runs to the next clause.
    const tail = text.slice(frameAt);
    const next = tail.search(/[،,.؛]|\s[وف](?:بعدين|كمان|دفعت|جبت|اشتريت|ركبت|صرفت|طلبت)(?=\s)/);
    frameEnd = next > 0 ? frameAt + next : text.length;
  } else {
    // Swallow a unit or headcount noun right after the closing number.
    const trailing = /^\s*(?:جنيه|ج\.م|ج|افراد|أفراد|اشخاص|أشخاص|نفر|زمايلي|صحابي|اصحابي)(?=\s|$)/.exec(text.slice(frameEnd));
    if (trailing) frameEnd += trailing[0].length;
  }
  let frameStart = split ? split.index : frameAt;
  if (!split && weBought) {
    // "طلبنا بيتزا بـ 400 ودفعت أنا 200": the sharing clause is the one after the bill.
    const afterTotal = text.slice(total.index + total.length);
    const clauseStart = afterTotal.search(/\s[وف]?\S*(?:دفعت|دفع)/);
    frameStart = clauseStart >= 0 ? total.index + total.length + clauseStart : frameStart;
  }
  const head = text.slice(0, total.index) + fmt(amount) + text.slice(total.index + total.length, frameStart);
  const tail = text.slice(frameEnd).replace(/^\s*[،,]?\s*/, " ");
  return { text: (head + tail).replace(/\s+/g, " ").replace(/\s+([،,.])/g, "$1").trim(), note };
}

// ── The stage ─────────────────────────────────────────────────────────────────────────────────────

/** Runs on the light text (numbers already digits); `resolveListMarkers` runs on the raw text first. */
export function resolveAmountRoles(lightText: string, listMarkers = false): AmountRoleResult {
  const notes: AmountRoleNote[] = [];
  const dropped: AmountRoleResult["dropped"] = [];
  if (listMarkers) notes.push("list_marker");

  const instructions = dropInstructions(lightText);
  let text = instructions.text;
  for (const d of instructions.dropped) dropped.push({ text: d, reason: "instruction_ignored" });
  if (instructions.dropped.length) notes.push("instruction_ignored");

  const steps: Array<[(t: string) => { text: string; found: boolean }, AmountRoleNote]> = [
    [removeTimes, "time_number"],
    [convertPiastres, "piastres"],
    [applyCorrections, "amount_corrected"],
    [removeLabels, "label_number"],
    [removeQuantities, "quantity_number"],
  ];
  for (const [step, note] of steps) {
    const result = step(text);
    text = result.text;
    if (result.found) notes.push(note);
  }

  const split = resolveSplitBill(text);
  text = split.text;
  if (split.note) notes.push(split.note);

  return { text, notes, dropped };
}
