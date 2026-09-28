/**
 * Egyptian spending seasons as date ranges: "رمضان كلفني كام".
 *
 * A season is a tag on time, not a category: ياميش رمضان stays أكل وشرب, and the season is
 * answered by adding up what was spent between its dates. Ramadan and the two Eids follow
 * the Hijri calendar (Umm al-Qura, as the runtime's ICU computes it), so they move eleven
 * days a year; the school and summer seasons are fixed Gregorian months. Days are Cairo
 * business days (`app-time.ts`).
 */
import { businessDateKey, startOfBusinessDay } from "./app-time";
import { env } from "./env";

export const SEASON_IDS = ["ramadan", "eid_fitr", "eid_adha", "school", "summer"] as const;
export type SeasonId = (typeof SEASON_IDS)[number];

export const SEASON_LABELS: Record<SeasonId, string> = {
  ramadan: "رمضان",
  eid_fitr: "عيد الفطر",
  eid_adha: "عيد الأضحى",
  school: "دخول المدارس",
  summer: "الصيف",
};

export interface SeasonRange {
  season: SeasonId;
  label: string;
  /** First and last Cairo day, YYYY-MM-DD, inclusive. */
  startDay: string;
  endDay: string;
  /** UTC instants bounding those days, end exclusive, for querying stored datetimes. */
  start: Date;
  endExclusive: Date;
}

const hijriFormatter = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
  timeZone: "UTC",
  month: "numeric",
  day: "numeric",
});

/** Hijri month and day of a Gregorian day key. */
export function hijriOf(dayKey: string): { month: number; day: number } {
  const parts = hijriFormatter.formatToParts(new Date(`${dayKey}T12:00:00Z`));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { month: value("month"), day: value("day") };
}

function inHijriSeason(season: SeasonId, dayKey: string): boolean {
  const { month, day } = hijriOf(dayKey);
  if (season === "ramadan") return month === 9;
  // Eid al-Fitr: the first three days of Shawwal. Eid al-Adha: Arafat eve's next day
  // through the days of Tashreeq (10-13 Dhu al-Hijjah).
  if (season === "eid_fitr") return month === 10 && day <= 3;
  if (season === "eid_adha") return month === 12 && day >= 10 && day <= 13;
  return false;
}

function dayKeysOfYear(year: number): string[] {
  const keys: string[] = [];
  for (let time = Date.UTC(year, 0, 1); time < Date.UTC(year + 1, 0, 1); time += 86_400_000) {
    keys.push(new Date(time).toISOString().slice(0, 10));
  }
  return keys;
}

function nextDayKey(dayKey: string): string {
  return new Date(Date.parse(`${dayKey}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/**
 * The season's dates in a Gregorian year: the first run of matching days (Ramadan falls
 * once a Gregorian year in every year this app will see; when it spans New Year, the run
 * that starts in the year is taken).
 */
export function seasonRange(season: SeasonId, year: number, timeZone = env.APP_TIMEZONE): SeasonRange | null {
  let startDay: string | null = null;
  let endDay: string | null = null;
  if (season === "school") {
    // Egyptian schools open in late September; supplies, uniforms and fees cluster from
    // September to mid-October.
    startDay = `${year}-09-01`;
    endDay = `${year}-10-15`;
  } else if (season === "summer") {
    startDay = `${year}-06-01`;
    endDay = `${year}-08-31`;
  } else {
    for (const key of dayKeysOfYear(year)) {
      const match = inHijriSeason(season, key);
      if (match && !startDay) startDay = key;
      if (match) endDay = key;
      if (!match && startDay) break;
    }
  }
  if (!startDay || !endDay) return null;
  const noon = (key: string) => new Date(`${key}T12:00:00Z`);
  return {
    season,
    label: SEASON_LABELS[season],
    startDay,
    endDay,
    start: startOfBusinessDay(noon(startDay), timeZone),
    endExclusive: startOfBusinessDay(noon(nextDayKey(endDay)), timeZone),
  };
}

/** The most recent occurrence of the season that has started by `now`. */
export function latestSeasonRange(season: SeasonId, now = new Date(), timeZone = env.APP_TIMEZONE): SeasonRange | null {
  const year = Number(businessDateKey(now, timeZone).slice(0, 4));
  const thisYear = seasonRange(season, year, timeZone);
  if (thisYear && thisYear.start.getTime() <= now.getTime()) return thisYear;
  return seasonRange(season, year - 1, timeZone);
}
