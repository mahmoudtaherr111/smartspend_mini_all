/**
 * When the money moved. A message's own date and time win; a date without a year ("09-10") takes the year the phone
 * received it in, or the year before when that would put it in the future; a time alone is that day's; nothing
 * written means the moment the phone received it. Dates are the business zone's wall clock (Cairo), never the
 * server's.
 */
import { businessDateKey, parseBusinessInstant } from "../../app-time";
import type { Piece } from "./spans";

type DatePiece = Extract<Piece, { kind: "date" }>;
type TimePiece = Extract<Piece, { kind: "time" }>;

const DAY = 86_400_000;
const pad = (value: number) => String(value).padStart(2, "0");

export interface WhenResult {
  occurredAt: Date;
  from: "message" | "message_date" | "received";
  date: DatePiece | null;
  time: TimePiece | null;
}

export function readWhen(pieces: Piece[], receivedAt: Date, timeZone: string): WhenResult {
  const date = (pieces.find((piece) => piece.kind === "date") as DatePiece | undefined) ?? null;
  const time = (pieces.find((piece) => piece.kind === "time") as TimePiece | undefined) ?? null;
  const [receivedYear, receivedMonth, receivedDay] = businessDateKey(receivedAt, timeZone).split("-").map(Number);
  const at = (year: number, month: number, day: number, hour: number, minute: number) =>
    parseBusinessInstant(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`, timeZone);

  if (date) {
    let year = date.year ?? receivedYear;
    const hour = time?.hour ?? 12;
    const minute = time?.minute ?? 0;
    let instant = at(year, date.month, date.day, hour, minute);
    // A message cannot describe tomorrow: a date without a year that lands ahead belongs to last year.
    if (date.year === null && instant.getTime() > receivedAt.getTime() + DAY) {
      year -= 1;
      instant = at(year, date.month, date.day, hour, minute);
    }
    if (Number.isNaN(instant.getTime())) return { occurredAt: receivedAt, from: "received", date: null, time: null };
    // The day without a time is the day it happened; when that day is today, the moment received is closer.
    if (!time && year === receivedYear && date.month === receivedMonth && date.day === receivedDay) {
      return { occurredAt: receivedAt, from: "message_date", date, time: null };
    }
    return { occurredAt: instant, from: time ? "message" : "message_date", date, time };
  }
  if (time) {
    let instant = at(receivedYear, receivedMonth, receivedDay, time.hour, time.minute);
    // "at 23:50" received just after midnight was yesterday.
    if (instant.getTime() > receivedAt.getTime() + 60 * 60_000) instant = new Date(instant.getTime() - DAY);
    return { occurredAt: instant, from: "message", date: null, time };
  }
  return { occurredAt: receivedAt, from: "received", date: null, time: null };
}
