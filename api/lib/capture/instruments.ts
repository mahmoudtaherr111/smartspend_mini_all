/** Local instrument tails. References and recipient accounts cannot silently become the user's funding wallet. */
import { asciiDigits } from "../anonymizer";
import type { PreparedCaptureText } from "./privacy";

export interface LocalInstrument { kind: "card" | "account"; suffix: string; role: "from" | "to" | "own" | "unspecified" }
const ROLES = /\b(card|visa|mastercard|meeza|account|acct|wallet|ref(?:erence)?|rrn)\b|بطاق[ةه]|بطاقتك|البطاق[ةه]|كارت|فيزا|حساب(?:ك|كم)?|محفظ[ةه](?:ك)?|مرجع/giu;
const FROM = /\bfrom\b|(?:^|[\s:])من(?:\s|$)/giu;
const TO = /\bto\b|(?:^|[\s:])(?:إلى|الى|على|لحساب)(?:\s|$)/giu;
function lastIndex(text: string, pattern: RegExp): number { return [...text.matchAll(pattern)].at(-1)?.index ?? -1; }

export function localInstruments(text: PreparedCaptureText): LocalInstrument[] {
  const found: LocalInstrument[] = [];
  for (const marker of text.markers) {
    if (marker.kind !== "CARD" && marker.kind !== "ACCOUNT") continue;
    const raw = text.localValue(marker.marker) ?? "";
    const digits = asciiDigits(raw).replace(/\D/g, "");
    if (digits.length < 3) continue;
    let at = text.text.indexOf(marker.marker);
    while (at >= 0) {
      const prefix = text.text.slice(Math.max(0, at - 100), at);
      const role = [...prefix.matchAll(ROLES)].at(-1);
      if (role && /^(?:ref(?:erence)?|rrn|مرجع)$/iu.test(role[0])) { at = text.text.indexOf(marker.marker, at + marker.marker.length); continue; }
      if (role || (marker.kind === "CARD" && /[*xX•]{2,}/u.test(raw))) {
        const kind = role && /^(?:account|acct|wallet|حساب|محفظ)/iu.test(role[0]) ? "account" as const : "card" as const;
        const from = lastIndex(prefix, FROM), to = lastIndex(prefix, TO);
        const own = /\b(?:your|my|own)\b|(?:بطاقتك|حسابك|حسابكم|محفظتك)/iu.test(prefix);
        found.push({ kind, suffix: digits.slice(kind === "card" ? -4 : -8), role: from > to ? "from" : to > from ? "to" : own ? "own" : "unspecified" });
      }
      at = text.text.indexOf(marker.marker, at + marker.marker.length);
    }
  }
  return found.filter((item, i) => found.findIndex((other) => other.kind === item.kind && other.suffix === item.suffix && other.role === item.role) === i);
}

export function primaryInstrument(text: PreparedCaptureText, flow: "in" | "out", kind: string): LocalInstrument | null {
  const known = localInstruments(text);
  const direction = flow === "out" ? "from" : "to";
  const directional = known.filter((item) => item.role === direction);
  const owned = known.filter((item) => item.role === "own");
  const candidates = directional.length ? directional : owned;
  if (candidates.length === 1) return candidates[0];
  if (!candidates.length && known.length === 1 && known[0].role === "unspecified" && kind !== "transfer" && kind !== "reversal") return known[0];
  return null;
}
