/** Recurrence is application-level: every occurrence becomes a distinct NIP-52 event. */
export const DEFAULT_WEEKDAY = 6; // Sunday=0; Saturday=6.
export const DEFAULT_OCCURRENCES = 8;
export const MAX_OCCURRENCES = 26;
export const MAX_HORIZON_DAYS = 180;
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export type WalkSchedule = {
  seriesId: string;
  firstDate: string;
  localTime: string;
  timeZone: string;
  frequency: "once" | "weekly" | "fortnightly";
  weekday: number;
  count: number;
  durationMinutes: number;
  excludedDates?: string[];
};
export type WalkOccurrence = { id: string; seriesId: string; localDate: string; localTime: string; timeZone: string; start: number; end: number };
const DAY = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function parseDate(value: string): number {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) throw new Error("Choose a valid date between 2000 and 2099.");
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new Error("Choose a valid calendar date.");
  return time;
}

function formatter(timeZone: string) {
  // Reject numeric offset zones: a city's IANA zone must carry its daylight-saving rules.
  if (!timeZone || /^[+-]/.test(timeZone)) throw new Error("Confirm the city's IANA timezone, for example America/Chicago for Memphis.");
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  } catch { throw new Error("Choose a valid IANA timezone, for example America/Chicago for Memphis."); }
}

function localParts(format: Intl.DateTimeFormat, time: number): number {
  const p = Object.fromEntries(format.formatToParts(new Date(time)).map(part => [part.type, part.value]));
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
}

/** Reject nonexistent and ambiguous clock times instead of silently moving a walk. */
export function localStart(date: string, clock: string, timeZone: string): number {
  const midnight = parseDate(date);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(clock)) throw new Error("Choose a valid local start time.");
  const [hour, minute] = clock.split(":").map(Number);
  const wall = midnight + (hour * 60 + minute) * 60_000;
  const format = formatter(timeZone);
  const offsets = new Set<number>();
  // Sample surrounding offsets, then round-trip each candidate. This also handles
  // half-hour offsets, DST transitions and whole-date skips without using device TZ.
  for (let hours = -48; hours <= 48; hours += 6) {
    const probe = wall + hours * 3_600_000;
    offsets.add(localParts(format, probe) - probe);
  }
  const candidates = [...offsets].map(offset => wall - offset).filter(time => localParts(format, time) === wall);
  if (!candidates.length) throw new Error(`${date} ${clock} does not exist in ${timeZone} because the clocks change. Choose another time.`);
  if (candidates.length !== 1) throw new Error(`${date} ${clock} occurs twice in ${timeZone} because the clocks change. Choose an unambiguous time.`);
  return candidates[0] / 1000;
}

export function scheduleOccurrences(schedule: WalkSchedule, now = Date.now()): WalkOccurrence[] {
  if (!UUID.test(schedule.seriesId)) throw new Error("A valid series identifier is required.");
  if (!["once", "weekly", "fortnightly"].includes(schedule.frequency)) throw new Error("Choose a supported repeat interval.");
  if (!Number.isInteger(schedule.weekday) || schedule.weekday < 0 || schedule.weekday > 6) throw new Error("Choose a weekday.");
  if (!Number.isInteger(schedule.count) || schedule.count < 1 || schedule.count > MAX_OCCURRENCES) throw new Error(`Publish between 1 and ${MAX_OCCURRENCES} occurrences at a time.`);
  if (!Number.isInteger(schedule.durationMinutes) || schedule.durationMinutes < 15 || schedule.durationMinutes > 720) throw new Error("Choose a duration between 15 minutes and 12 hours.");
  const exclusions = new Set(schedule.excludedDates ?? []);
  if (exclusions.size > MAX_OCCURRENCES) throw new Error("Too many skipped dates.");
  for (const date of exclusions) parseDate(date);
  let day = parseDate(schedule.firstDate);
  const repeats = schedule.frequency !== "once";
  if (repeats) day += ((schedule.weekday - new Date(day).getUTCDay() + 7) % 7) * DAY;
  const count = repeats ? schedule.count : 1;
  const result: WalkOccurrence[] = [];
  for (let index = 0; index < count; index++) {
    const localDate = new Date(day).toISOString().slice(0, 10);
    if (!exclusions.has(localDate)) {
      const start = localStart(localDate, schedule.localTime, schedule.timeZone);
      if (start * 1000 < now) throw new Error("All previewed walks must start in the future.");
      if (start * 1000 > now + MAX_HORIZON_DAYS * DAY) throw new Error(`Preview only the next ${MAX_HORIZON_DAYS} days. Reduce the occurrence count or choose an earlier date.`);
      result.push({ id: `${schedule.seriesId}:${localDate}`, seriesId: schedule.seriesId, localDate, localTime: schedule.localTime, timeZone: schedule.timeZone, start, end: start + schedule.durationMinutes * 60 });
    }
    day += (schedule.frequency === "fortnightly" ? 14 : 7) * DAY;
  }
  if (!result.length) throw new Error("At least one occurrence must remain after skipped dates.");
  return result;
}

/** NIP-52 day tags cover the event's full interval (end is exclusive). */
export function occurrenceDays(start: number, end: number): string[] {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end - start > 43_200) throw new Error("Invalid occurrence interval.");
  const days: string[] = [];
  for (let day = Math.floor(start / 86_400); day <= Math.floor((end - 1) / 86_400); day++) days.push(String(day));
  return days;
}
