export const SITE_GUIDE_EMBEDDING_DIMENSIONS = 256 as const;

const ARABIC_NORMALIZE_MAP: Record<string, string> = {
  أ: "ا",
  إ: "ا",
  آ: "ا",
  ٱ: "ا",
  ؤ: "و",
  ئ: "ي",
  ى: "ي",
  ة: "ه",
};

export function normalizeSiteGuideText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[أإآٱؤئىة]/g, (char) => ARABIC_NORMALIZE_MAP[char] ?? char)
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function siteGuideTokens(value: string): string[] {
  const tokens = normalizeSiteGuideText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

  const variants = new Set<string>();
  for (const token of tokens) {
    variants.add(token);
    if (token.startsWith("ال") && token.length > 4) variants.add(token.slice(2));
    if (token.startsWith("ا") && token.length > 4) variants.add(token.slice(1));
    if (token.endsWith("ي") && token.length > 4) variants.add(token.slice(0, -1));
    if (token.startsWith("بال") && token.length > 5) variants.add(token.slice(3));
    if (token.startsWith("ب") && token.length > 4) variants.add(token.slice(1));
  }

  return [...variants];
}

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function buildSiteGuideEmbedding(text: string): number[] {
  const vector = Array.from({ length: SITE_GUIDE_EMBEDDING_DIMENSIONS }, () => 0);
  for (const token of siteGuideTokens(text)) {
    const hash = hashToken(token);
    const index = hash % SITE_GUIDE_EMBEDDING_DIMENSIONS;
    vector[index] += hash % 2 === 0 ? 1 : -1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / norm).toFixed(6)));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
  }
  return dot;
}
