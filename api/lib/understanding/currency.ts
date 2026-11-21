/** The recording ledger and its review card both use EGP. Ask for the actual local
 * amount, including the purpose so a corrected sentence can be read independently. */
export const EGP_RESTATEMENT = "الحساب بالجنيه المصري. اكتب العملية تاني بالغرض والمبلغ الفعلي بالمصري لكل حركة.";

const currencyName = /(?<!\p{L})(?:[وبفل]?ال|[وبفل])?(?:دولار(?:ات)?|يوروه?ات|يورو|ريال(?:ات)?|درهم|دراهم|دينار|دنانير|استرليني|إسترليني|سترليني|فرنك|roubles?|dollars?|euros?|riyals?|dirhams?|dinars?|sterling|usd|eur|gbp|sar|aed|kwd|jod|qar|omr|bhd|cad|aud|chf|jpy|cny)(?!\p{L})/iu;

export function mentionsForeignCurrency(text: string): boolean {
  const words = text.normalize("NFKC").replace(/[ً-ٰٟـ]/gu, "");
  return /[$€£¥₹₽]/u.test(words) || currencyName.test(words);
}
