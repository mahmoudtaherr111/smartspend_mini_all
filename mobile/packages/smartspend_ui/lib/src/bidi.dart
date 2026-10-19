/// Keeps [text] as one left-to-right run inside right-to-left text, with Unicode's isolate marks (LRI … PDI).
///
/// Without it a Latin merchant or sender name from a bank message ("UBER *TRIP", "Talabat.", "CIB-EG") or a signed
/// number inside an Arabic sentence has its punctuation or sign moved to the wrong end of the line (rule 2.4 of
/// docs/guides/mobile-design.md).
String ltrIsolate(String text) => '\u2066$text\u2069';

/// Whether [text] has a letter from a right-to-left script (Arabic, Hebrew and their presentation forms).
bool hasRtlLetters(String text) => RegExp(
  r'[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]',
  unicode: true,
).hasMatch(text);

/// [text] ready to sit inside an Arabic sentence: isolated left to right when it has no right-to-left letters,
/// as written otherwise.
String inlineName(String text) => hasRtlLetters(text) ? text : ltrIsolate(text);
