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
