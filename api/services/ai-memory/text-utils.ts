import { createHash } from "crypto";

export function normalizeMemoryText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
    .replace(/\u0624/g, "\u0648")
    .replace(/\u0626/g, "\u064a")
    .replace(/\u0649/g, "\u064a")
    .replace(/\u0629/g, "\u0647")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function contentHash(value: string): string {
  return createHash("sha256").update(normalizeMemoryText(value)).digest("hex");
}

export function truncateWords(value: string, maxWords: number): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
}

function includesAny(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => value.includes(pattern));
}

function hasTokenOrLightPrefix(tokens: Set<string>, token: string): boolean {
  return (
    tokens.has(token) ||
    tokens.has(`و${token}`) ||
    tokens.has(`ف${token}`) ||
    tokens.has(`ب${token}`) ||
    tokens.has(`ل${token}`)
  );
}

export function isMemoryRecallQuestion(value: string): boolean {
  const normalized = normalizeMemoryText(value);
  if (!normalized) return false;
  const tokens = new Set(normalized.split(/\s+/).filter(Boolean));

  const storeCommand = includesAny(normalized, [
    "افتكر ان",
    "خليك فاكر",
    "احفظ",
    "سجل معلومه",
    "متنساش ان",
    "remember that",
  ]);
  if (storeCommand) return false;

  const hasRecallVerb = ["فاكر", "تفتكر", "افتكر", "remember"].some((token) =>
    hasTokenOrLightPrefix(tokens, token),
  );
  if (!hasRecallVerb) return false;

  const asksForRecall =
    /[؟?]/.test(value) ||
    ["قولي", "قوللي", "ايه", "اي", "كان", "كنا", "اتكلمنا", "حاولت", "فين", "امتي", "امتى", "الخطة", "الخطه"].some(
      (token) => tokens.has(token),
    ) ||
    ["اتفقنا", "اتفاقنا"].some((token) => tokens.has(token)) ||
    normalized.includes("قول لي");

  return asksForRecall;
}

export function isLowSignalMemoryText(value: string): boolean {
  const normalized = normalizeMemoryText(value);
  if (!normalized) return true;
  const tokens = new Set(normalized.split(/\s+/).filter(Boolean));
  const asksMemoryLookup =
    (tokens.has("ذاكره") || tokens.has("الذاكره") || tokens.has("ذكريات") || normalized.includes("من الذاكره")) &&
    ([
      "هاتلي",
      "هات",
      "طلع",
      "دور",
      "ابحث",
      "راجع",
      "اذكر",
      "عندك",
      "كانت",
      "كان",
      "ايه",
      "اي",
      "قولي",
      "قل",
      "عايز",
      "عاوز",
    ].some((token) => tokens.has(token)) ||
      normalized.includes("قل لي") ||
      normalized.includes("من غير ما تكرر"));
  if (isMemoryRecallQuestion(value)) return true;
  if (asksMemoryLookup) return true;
  if (normalized.startsWith("فاكر الاتي") || normalized.includes(" فاكر الاتي ")) return true;
  if (normalized.startsWith("فاكر الخلاصه") || normalized.includes(" فاكر الخلاصه ")) return true;
  if (normalized.startsWith("ذاكره ") && normalized.includes("اذكر")) return true;
  if (normalized.includes("مش لاقي ذكري") || normalized.includes("استعلام ذاكره بدون ذكري جديده")) {
    return true;
  }
  if (
    normalized.includes("اجمالي صرفك") ||
    normalized.includes("العمليات اللي دخلت") ||
    normalized.includes("من بياناتك المؤكده") ||
    normalized.includes("خطه امنه علي البيانات المؤكده") ||
    normalized.includes("نحتاج لرد علي طلب المستخدم") ||
    normalized.includes("اكتب الرد النهائي")
  ) {
    return true;
  }
  if (/^(موافق|تمام|اوك|اكد|نفذ|اعمل الهدف دلوقتي)(\s|$)/.test(normalized)) return true;
  if (normalized.includes("صرفت كام") || normalized.includes("العمليات اللي اتحسبت")) return true;
  return false;
}

export function keywordTokens(value: string): Set<string> {
  const ignored = new Set([
    "في",
    "من",
    "على",
    "عن",
    "انا",
    "انت",
    "هو",
    "هي",
    "ده",
    "دي",
    "دا",
    "ايه",
    "كام",
    "اللي",
    "اللى",
    "الي",
    "الذي",
    "التي",
    "اتكلمنا",
    "تكلمنا",
    "اتحدثنا",
    "اتكلمت",
    "اتكلم",
    "عنها",
    "عنه",
    "عليها",
    "عليه",
    "فاكر",
    "تفتكر",
    "افتكر",
    "كلمتك",
    "قلتلك",
    "المحادثه",
    "الشات",
    "رقم",
    "الرقم",
    "مده",
    "المده",
    "مدة",
    "المدة",
    "فقط",
    "بس",
    "عايز",
    "عاوز",
    "كنت",
    "the",
    "and",
    "for",
    "with",
    "عشان",
    "علشان",
    "عشانك",
    "عشانه",
    "عشانها",
  ]);

  const expandToken = (token: string): string[] => {
    const variants = new Set([token]);
    const queue = [token];
    for (const current of queue) {
      const next: string[] = [];
      if (current.startsWith("لل") && current.length > 4) next.push(current.slice(2));
      if (current.startsWith("ال") && current.length > 4) next.push(current.slice(2));
      if (/^[وبفل]/.test(current) && current.length > 4) next.push(current.slice(1));
      for (const variant of next) {
        if (!variants.has(variant)) {
          variants.add(variant);
          queue.push(variant);
        }
      }
    }
    return [...variants];
  };

  const tokens = normalizeMemoryText(value)
    .split(/\s+/)
    .flatMap(expandToken)
    .filter((token) => token.length >= 3 && !ignored.has(token));

  return new Set(tokens);
}

const GENERIC_MEMORY_TOKEN_VALUES = [
  "هدف",
  "الهدف",
  "اهداف",
  "الاهداف",
  "ادخار",
  "توفير",
  "خطه",
  "الخطه",
  "خطة",
  "الخطة",
  "رقم",
  "الرقم",
  "مده",
  "المده",
  "مدة",
  "المدة",
  "اتفاق",
  "محادثه",
  "ذاكره",
  "احوش",
  "ادخر",
  "خطة",
  "saving",
  "target",
  "goal",
  "memory",
];

const GENERIC_MEMORY_TOKENS = new Set(
  GENERIC_MEMORY_TOKEN_VALUES.flatMap((token) => [token, normalizeMemoryText(token)]),
);

export function specificTokenScore(query: string, candidate: string): number {
  const queryTokens = [...keywordTokens(query)].filter((token) => !GENERIC_MEMORY_TOKENS.has(token));
  if (queryTokens.length === 0) return 0;

  const candidateTokens = keywordTokens(candidate);
  const matches = queryTokens.filter((token) => candidateTokens.has(token)).length;
  if (matches === 0) return -0.2;

  return Math.min(0.45, 0.18 + (matches / queryTokens.length) * 0.27);
}

export function lexicalScore(query: string, candidate: string): number {
  const queryTokens = keywordTokens(query);
  const candidateTokens = keywordTokens(candidate);
  if (queryTokens.size === 0 || candidateTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) overlap += 1;
  }

  return overlap / Math.sqrt(queryTokens.size * candidateTokens.size);
}

export function cosineSimilarity(a: number[] | undefined, b: number[] | undefined): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aMag += a[i] * a[i];
    bMag += b[i] * b[i];
  }
  if (aMag === 0 || bMag === 0) return 0;
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
}

export function localDateTime(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}
