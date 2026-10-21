/**
 * A message cut into clauses: a new line, a sentence end (". " or "." at the end), "،", "؛", ";", "!", "?" or a
 * spaced dash. A balance sentence ("المتاح 9000.00 جم", "Card available limit is EGP 10000.21") is its own clause,
 * so its number is never taken for the amount. A boundary inside a piece ("L.E. 500") does not cut it.
 */
import type { NormalizedMessage } from "./normalize";
import type { Piece } from "./spans";

export interface Clause {
  index: number;
  start: number;
  end: number;
}

export function splitClauses(message: NormalizedMessage, pieces: Piece[]): Clause[] {
  const { text } = message;
  const inPiece = (at: number) => pieces.some((piece) => piece.start <= at && at < piece.end);
  const cuts: number[] = [];
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (inPiece(at)) continue;
    const next = text[at + 1];
    const isCut =
      char === "\n" ||
      char === "،" ||
      char === "؛" ||
      char === ";" ||
      char === "!" ||
      char === "?" ||
      char === "؟" ||
      (char === "." && (next === undefined || next === " " || next === "\n")) ||
      (char === "-" && text[at - 1] === " " && next === " ");
    if (isCut) cuts.push(at);
  }
  const clauses: Clause[] = [];
  let start = 0;
  for (const cut of [...cuts, text.length]) {
    if (cut > start) clauses.push({ index: clauses.length, start, end: cut });
    start = cut + 1;
  }
  return clauses;
}

export function clauseAt(clauses: Clause[], position: number): Clause | null {
  return clauses.find((clause) => clause.start <= position && position < clause.end) ?? null;
}
