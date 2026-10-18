/** What a person types to delete their account: the dialog shows it, and the server checks it. */
export const ACCOUNT_DELETION_PHRASE = "احذف حسابي";
export const ACCOUNT_DELETION_PHRASE_EN = "delete my account";

function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/ـ/g, "") // tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Whether the typed text is the phrase, in Arabic or English, however hamza, spaces and case fall. */
export function isAccountDeletionConfirmed(typed: string): boolean {
  const value = normalize(typed);
  return value === normalize(ACCOUNT_DELETION_PHRASE) || value === normalize(ACCOUNT_DELETION_PHRASE_EN);
}
