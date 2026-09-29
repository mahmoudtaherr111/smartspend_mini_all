import { env } from "./env";

const DATE_PARTS_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function datePartsFormatter(timeZone = env.APP_TIMEZONE): Intl.DateTimeFormat {
  const cached = DATE_PARTS_FORMATTER_CACHE.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  DATE_PARTS_FORMATTER_CACHE.set(timeZone, formatter);
  return formatter;
}

/** YYYY-MM-DD in the explicit business timezone, independent of host UTC. */
export function businessDateKey(value = new Date(), timeZone = env.APP_TIMEZONE): string {
  const parts = datePartsFormatter(timeZone).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

/** "YYYY-MM-DD HH:mm" in the business timezone: a moment as the user's own clock shows it. */
export function businessTimeLabel(value = new Date(), timeZone = env.APP_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${businessDateKey(value, timeZone)} ${byType.hour}:${byType.minute}`;
}

/**
 * UTC instant for the start of a business day.  Iteration handles Cairo's DST
 * transitions without mutating the database/server timezone.
 */
export function startOfBusinessDay(value = new Date(), timeZone = env.APP_TIMEZONE): Date {
  const key = businessDateKey(value, timeZone);
  const [year, month, day] = key.split("-").map(Number);
  const targetUtc = Date.UTC(year, month - 1, day);
  let candidate = new Date(targetUtc);

  for (let index = 0; index < 3; index += 1) {
    const parts = datePartsFormatter(timeZone).formatToParts(candidate);
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const localUtc = Date.UTC(Number(byType.year), Number(byType.month) - 1, Number(byType.day));
    const dayDelta = (localUtc - targetUtc) / 86_400_000;
    if (dayDelta === 0) break;
    candidate = new Date(candidate.getTime() - dayDelta * 86_400_000);
  }

  // Cairo is whole-hour based today.  Find the first instant whose local date
  // is the target date, which remains correct if the zone's offset changes.
  while (businessDateKey(new Date(candidate.getTime() - 60_000), timeZone) === key) {
    candidate = new Date(candidate.getTime() - 60_000);
  }
  while (businessDateKey(candidate, timeZone) !== key) {
    candidate = new Date(candidate.getTime() + 60_000);
  }
  return candidate;
}

export function businessDayRange(value = new Date(), timeZone = env.APP_TIMEZONE) {
  const start = startOfBusinessDay(value, timeZone);
  // Advance from the boundary, not the current instant: adding 36 hours to a
  // late-evening instant can otherwise skip directly to the day after tomorrow.
  const tomorrowReference = new Date(start.getTime() + 36 * 60 * 60 * 1000);
  const nextStart = startOfBusinessDay(tomorrowReference, timeZone);
  return { start, endExclusive: nextStart };
}

/** The current Gregorian calendar month in the configured business timezone. */
export function businessMonthRange(value = new Date(), timeZone = env.APP_TIMEZONE) {
  const [year, month] = businessDateKey(value, timeZone).split("-").map(Number);
  // Noon UTC is safely inside the intended date for every configured deployment
  // timezone; startOfBusinessDay then resolves the exact local boundary.
  const start = startOfBusinessDay(new Date(Date.UTC(year, month - 1, 1, 12)), timeZone);
  const nextStart = startOfBusinessDay(new Date(Date.UTC(year, month, 1, 12)), timeZone);
  return { start, endExclusive: nextStart };
}

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/;

/**
 * An instant from a date the client wrote without a time zone ("2026-09-20" or "2026-09-20T23:59:59.999"), read as
 * that wall-clock time in the business timezone. `new Date(...)` reads such a string in the server's own zone, so on
 * a UTC server the calendar's day "2026-09-20" began at 02:00 or 03:00 Cairo time and lost the entries before it.
 * A string with `Z` or an offset names its instant already and is read as it is.
 */
export function parseBusinessInstant(value: string, timeZone = env.APP_TIMEZONE): Date {
  const match = WALL_CLOCK.exec(value.trim());
  if (!match) return new Date(value);
  const [, y, mo, d, h = "0", mi = "0", s = "0", ms = "0"] = match;
  const target = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), Number(ms.padEnd(3, "0")));
  const wallClockOf = (instant: number) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const byType = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
    return Date.UTC(byType.year, byType.month - 1, byType.day, byType.hour, byType.minute, byType.second) + (instant % 1000 + 1000) % 1000;
  };
  // The zone's offset at the guess, applied twice so an offset change near the time is settled.
  let guess = target;
  for (let step = 0; step < 2; step += 1) guess -= wallClockOf(guess) - target;
  return new Date(guess);
}
