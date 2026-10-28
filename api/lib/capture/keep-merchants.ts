/**
 * Redaction for captured bank messages that keeps the merchant (decision 0035). The general redaction
 * (api/lib/anonymizer.ts) masks every capitalised word after من، إلى، to or from, so "شراء من CARREFOUR" reached the
 * model as "[REDACTED_NAME]" and the model could not file it. Here a merchant stays when the reader named it as the
 * merchant, or when it looks like a business (a payment gateway's "PAYMOB*SHOP", a domain, «ماركت», «صيدلية»…); in a
 * transfer between people nothing is kept, so a person's name is still removed.
 */
import { redactWithFindings, type RedactedText } from "../anonymizer";

/** Kinds where the other side is usually a person: no name is kept unless the reader said it is a merchant. */
const PERSON_KINDS = new Set(["transfer_out", "transfer_in", "wallet_send", "wallet_receive", "cash_in", "cash_out"]);

const BUSINESS_PATTERNS = [
  // A payment gateway's merchant: "PAYMOB*CAIRO STORE", "FAWRY*VODAFONE".
  /\b[A-Z][A-Z0-9]{2,}\*[A-Z0-9][A-Z0-9 .&'-]*[A-Z0-9]/g,
  // A domain: "amazon.eg", "netflix.com".
  /\b[A-Za-z0-9-]{2,}\.(?:com|net|org|eg|io|co|app|store)\b/g,
  // An Arabic shop word with the word after it: «ماركت الحرية», «صيدلية العزبي».
  /(?:سوبر ?ماركت|هايبر ?ماركت|ماركت|صيدلي[ةه]|مطعم|كافيه|كافي|مول|شرك[ةه]|مخبز|محطة|بنزينة)\s+[^\s،,.]+/g,
];

export interface MerchantHint {
  kind: string;
  counterparty: { type: string; name: string | null } | null;
}

/** The names in `text` to keep through redaction, longest first. */
export function merchantNamesToKeep(text: string, reading: MerchantHint): string[] {
  const merchant = reading.counterparty?.type === "merchant" ? reading.counterparty.name : null;
  if (PERSON_KINDS.has(reading.kind) && !merchant) return [];
  const names = new Set<string>();
  if (merchant && text.includes(merchant)) names.add(merchant);
  if (!PERSON_KINDS.has(reading.kind)) {
    for (const pattern of BUSINESS_PATTERNS) {
      for (const match of text.matchAll(pattern)) names.add(match[0].trim());
    }
  }
  return [...names].filter((name) => name.length >= 3 && !/\d{4,}/.test(name)).sort((a, b) => b.length - a.length);
}

/** Redacts `text` as the general redaction does, except the `keep` names, which come back as they were written. */
export function redactKeeping(text: string, keep: string[]): RedactedText {
  if (keep.length === 0) return redactWithFindings(text);
  const slots: string[] = [];
  let shielded = text;
  for (const name of keep) {
    if (!shielded.includes(name)) continue;
    // Lower case and letters only: the redaction takes it for neither a name nor a number.
    shielded = shielded.split(name).join(`keepslot${String.fromCharCode(97 + slots.length)}x`);
    slots.push(name);
  }
  const redacted = redactWithFindings(shielded);
  return {
    ...redacted,
    text: redacted.text.replace(/keepslot([a-z])x/g, (_, letter: string) => slots[letter.charCodeAt(0) - 97] ?? ""),
  };
}
