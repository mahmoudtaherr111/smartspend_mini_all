/**
 * Egyptian Arabic number engine — the single place a spoken amount becomes a digit.
 *
 * This is compositional, not a word-by-word substitution table. "ميتين وخمسين" is one
 * amount of 250, not a 200 next to a 50, and "خمستاشر الف وخمسمية" is 15,500 rather
 * than three fragments. Getting that wrong does not merely mis-read a number: the
 * decomposer treats each fragment as its own transaction, so one spoken amount becomes
 * several phantom rows.
 *
 * Handles: ASCII and Arabic-Indic digits, spoken numerals including the Egyptian teens
 * (خمستاشر), run-together thousands (خمستلاف), fractions (ونص / وربع / وتلت), and the
 * street units باكو (1,000) and أرنب (1,000,000).
 */

// ─── Lexicon ───────────────────────────────────────────────────────

export const numMap: Record<string, number> = {
  // "واحد" is deliberately absent: "واحد صاحبي" / "واحد بيبسي" must not yield 1.
  اتنين: 2, إثنين: 2, اثنين: 2,
  تلاتة: 3, تلاته: 3, ثلاثة: 3, ثلاثه: 3, تلات: 3, ثلاث: 3,
  اربعة: 4, اربعه: 4, أربعة: 4, أربعه: 4, اربع: 4, أربع: 4,
  خمسة: 5, خمسه: 5, خمس: 5,
  ستة: 6, سته: 6, ست: 6,
  سبعة: 7, سبعه: 7, سبع: 7,
  تمانية: 8, تمانيه: 8, تمنية: 8, تمنيه: 8, تمان: 8, تمن: 8,
  تسعة: 9, تسعه: 9, تسع: 9,
  عشرة: 10, عشره: 10, عشر: 10,
  حداشر: 11, احداشر: 11, "أحد عشر": 11,
  اتناشر: 12, اطناشر: 12, "اثنا عشر": 12,
  تلاتاشر: 13, "ثلاثة عشر": 13,
  اربعتاشر: 14, "أربعة عشر": 14,
  خمستاشر: 15, "خمسة عشر": 15,
  ستاشر: 16, "ستة عشر": 16,
  سبعتاشر: 17, "سبعة عشر": 17,
  تمنتاشر: 18, تمانتاشر: 18, "ثمانية عشر": 18,
  تسعتاشر: 19, "تسعة عشر": 19,
  عشرين: 20,
  تلاتين: 30, ثلاثين: 30,
  اربعين: 40, أربعين: 40,
  خمسين: 50,
  ستين: 60,
  سبعين: 70,
  تمنين: 80, ثمانين: 80, تمانين: 80,
  تسعين: 90,
  // "مية" alone is water in Egyptian Arabic; it is resolved contextually below.
  مائة: 100, مائته: 100, مئة: 100,
  ميتين: 200, متين: 200, مئتين: 200, مائتين: 200,
  تلتمية: 300, تلتميه: 300, ثلاثمائة: 300, ثلثمائة: 300,
  ربعمية: 400, ربعميه: 400, اربعمية: 400, اربعميه: 400, أربعمائة: 400, اربعمائة: 400,
  خمسمية: 500, خمسميه: 500, خمسمائة: 500, خمسمائه: 500,
  ستمية: 600, ستميه: 600, ستمائة: 600, ستمائه: 600,
  سبعمية: 700, سبعميه: 700, سبعمائة: 700, سبعمائه: 700,
  تمنمية: 800, تمنميه: 800, ثمانمائة: 800, ثمانمائه: 800,
  تسعمية: 900, تسعميه: 900, تسعمائة: 900, تسعمائه: 900,
};

export const multiplierMap: Record<string, number> = {
  الف: 1000, ألف: 1000, آلاف: 1000, الاف: 1000, ألاف: 1000,
  الفين: 2000, ألفين: 2000,
  مليون: 1000000, مليونين: 2000000, ملايين: 1000000,
  // Egyptian street units.
  باكو: 1000, باكوين: 2000,
  ارنب: 1000000, أرنب: 1000000,
};

/** Fraction words, applied to the unit that precedes them. */
const FRACTION_MAP: Record<string, number> = {
  نص: 0.5, نصف: 0.5,
  ربع: 0.25,
  تلت: 1 / 3, ثلث: 1 / 3,
};

/**
 * Run-together colloquial thousands. Egyptians elide the space, and no amount of
 * compositional cleverness recovers "خمستلاف" — it has to be listed.
 */
const RUN_TOGETHER: Record<string, number> = {
  الفين: 2000,
  تلاتلاف: 3000, تلتلاف: 3000,
  اربعتلاف: 4000, ربعتلاف: 4000,
  خمستلاف: 5000, خمسلاف: 5000,
  ستلاف: 6000, ستتلاف: 6000,
  سبعتلاف: 7000, سبعلاف: 7000,
  تمنتلاف: 8000, تمانتلاف: 8000,
  تسعتلاف: 9000, تسعلاف: 9000,
  عشرتلاف: 10000, عشرلاف: 10000,
};

/** Compound street-unit phrases resolved before tokenizing. */
const UNIT_PHRASES: Array<[RegExp, string]> = [
  [/(^|\s)باكو\s+ونص(?=\s|$)/g, "$11500"],
  [/(^|\s)(?:أرنب|ارنب)\s+ونص(?=\s|$)/g, "$11500000"],
  [/(^|\s)نص\s+باكو(?=\s|$)/g, "$1500"],
  [/(^|\s)نص\s+(?:أرنب|ارنب)(?=\s|$)/g, "$1500000"],
  [/(^|\s)ربع\s+باكو(?=\s|$)/g, "$1250"],
  [/(^|\s)ربع\s+(?:أرنب|ارنب)(?=\s|$)/g, "$1250000"],
];

/**
 * Context that makes "مية"/"ميه" the number 100 rather than water. Egyptians say
 * "فاتورة المية" for the water bill and "مية وخمسين" for 150; only the surrounding
 * words separate them.
 */
const WATER_CONTEXT = /(فاتور|عداد|شرب|كوباي|ازاز|زجاج|عبو|مياه|سخان|فلتر|خرطوم|حنفي|معدني|معدنيه|معدنية)/;

const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/g;

/** Converts ٠-٩ and ۰-۹ to ASCII. JS \d is ASCII-only, so nothing downstream sees them otherwise. */
export function arabicIndicToAscii(text: string): string {
  return text.replace(ARABIC_INDIC_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

function isKnownNumberWord(word: string): boolean {
  return (
    numMap[word] !== undefined ||
    multiplierMap[word] !== undefined ||
    RUN_TOGETHER[word] !== undefined ||
    FRACTION_MAP[word] !== undefined ||
    isDigitLiteral(word)
  );
}

function stripClitic(word: string): { core: string; hadClitic: boolean } {
  if (word.length > 1 && (word.startsWith("و") || word.startsWith("ب") || word.startsWith("ل"))) {
    const core = word.slice(1);
    if (isKnownNumberWord(core)) return { core, hadClitic: true };
  }
  if (word.length > 2 && word.startsWith("بـ")) {
    return { core: word.slice(2), hadClitic: true };
  }
  return { core: word, hadClitic: false };
}

/** Currency words act as the unit "one" for a bare fraction: "جنيه ونص" is 1.5. */
const CURRENCY_UNIT = /^[وبل]?(?:ـ)?(?:ال)?(?:جنيه|جنية|جنيهات|ج)$/;

function isDigitLiteral(word: string): boolean {
  return /^\d+(?:[.,]\d+)?$/.test(word);
}

function digitValue(word: string): number {
  return parseFloat(word.replace(",", "."));
}

// ─── Accumulator ───────────────────────────────────────────────────

/**
 * Builds one number from a run of tokens.
 *
 * Additive composition ("ميتين" + "خمسين" = 250) is how Arabic numerals work, but it
 * must not be applied to two digit literals: "دفعت 100 و100" is two payments, and
 * summing them to 200 both loses a transaction and invents an amount.
 */
class NumberAccumulator {
  private total = 0;
  private segment = 0;
  private active = false;
  private lastWasDigitLiteral = false;

  get isActive(): boolean {
    return this.active;
  }

  /** Returns true when the token was consumed as part of the current number. */
  addWord(value: number): boolean {
    this.segment += value;
    this.active = true;
    this.lastWasDigitLiteral = false;
    return true;
  }

  /** Digit literals never chain with one another. Returns false if a flush is needed first. */
  canAddDigit(): boolean {
    return !this.lastWasDigitLiteral;
  }

  addDigit(value: number): void {
    this.segment += value;
    this.active = true;
    this.lastWasDigitLiteral = true;
  }

  addMultiplier(value: number): void {
    this.segment = this.segment === 0 ? value : this.segment * value;
    this.total += this.segment;
    this.segment = 0;
    this.active = true;
    this.lastWasDigitLiteral = false;
  }

  addFraction(value: number): void {
    const base = this.segment !== 0 ? this.segment : this.total;
    // "ألفين ونص" is 2,500: the fraction applies to the magnitude of what came before.
    const unit = magnitudeUnit(base);
    this.segment += unit * value;
    this.lastWasDigitLiteral = false;
  }

  flush(): number | null {
    if (!this.active) return null;
    const value = this.total + this.segment;
    this.total = 0;
    this.segment = 0;
    this.active = false;
    this.lastWasDigitLiteral = false;
    return value;
  }
}

/** "ألفين ونص" -> half of a thousand; "جنيه ونص" -> half of one. */
function magnitudeUnit(base: number): number {
  if (base >= 1_000_000) return 1_000_000;
  if (base >= 1000) return 1000;
  if (base >= 100) return 100;
  return 1;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

// ─── Public API ────────────────────────────────────────────────────

export function parseArabicNumbers(text: string): string {
  if (!text) return text;

  let processed = arabicIndicToAscii(text);
  for (const [pattern, replacement] of UNIT_PHRASES) {
    processed = processed.replace(pattern, replacement);
  }

  // Multi-word lexicon entries ("خمسة عشر") must resolve before tokenizing.
  for (const [key, value] of Object.entries(numMap)) {
    if (key.includes(" ")) {
      processed = processed.replace(new RegExp(`(^|\\s)${key}(?=\\s|$)`, "g"), `$1${value}`);
    }
  }

  const words = processed.split(/\s+/);
  const out: string[] = [];
  const acc = new NumberAccumulator();

  const flushInto = (): void => {
    const value = acc.flush();
    if (value !== null) out.push(formatNumber(value));
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!word) continue;

    const { core, hadClitic } = stripClitic(word);

    // A fraction joined by waw continues the number: "ألفين ونص" is 2,500.
    if (hadClitic && word.startsWith("و") && FRACTION_MAP[core] !== undefined) {
      if (acc.isActive) {
        acc.addFraction(FRACTION_MAP[core]);
        continue;
      }
      // "بجنيه ونص" — no number yet, but the preceding currency word is the unit.
      const prev = words[i - 1];
      if (prev && CURRENCY_UNIT.test(stripClitic(prev).core)) {
        out.pop();
        acc.addWord(1 + FRACTION_MAP[core]);
        continue;
      }
    }

    // A fraction standing before the currency is the amount itself: "بنص جنيه" is 0.5.
    if (FRACTION_MAP[core] !== undefined && !acc.isActive) {
      const next = words[i + 1];
      if (next && CURRENCY_UNIT.test(stripClitic(next).core)) {
        acc.addWord(FRACTION_MAP[core]);
        continue;
      }
    }

    const runTogether = RUN_TOGETHER[core];
    if (runTogether !== undefined) {
      flushInto();
      acc.addWord(runTogether);
      continue;
    }

    if (isDigitLiteral(core)) {
      const value = digitValue(core);
      if (!acc.canAddDigit()) {
        // Two digit literals in a row are two separate amounts, not a sum.
        flushInto();
      }
      acc.addDigit(value);
      continue;
    }

    const multiplier = multiplierMap[core];
    if (multiplier !== undefined) {
      acc.addMultiplier(multiplier);
      continue;
    }

    if ((core === "مية" || core === "ميه") && !WATER_CONTEXT.test(processed)) {
      acc.addWord(100);
      continue;
    }

    const word_ = numMap[core];
    if (word_ !== undefined) {
      acc.addWord(word_);
      continue;
    }

    // A bare waw between two numbers keeps the composition open ("مية و خمسين").
    if (word === "و" || word === "وا") {
      const next = words[i + 1];
      if (next) {
        const { core: nextCore } = stripClitic(next);
        const continues =
          numMap[nextCore] !== undefined ||
          multiplierMap[nextCore] !== undefined ||
          RUN_TOGETHER[nextCore] !== undefined ||
          FRACTION_MAP[nextCore] !== undefined;
        if (continues && acc.isActive) continue;
      }
    }

    flushInto();
    out.push(word);
  }

  flushInto();
  return out.join(" ");
}
