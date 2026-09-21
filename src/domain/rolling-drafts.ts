import { z } from "zod";
import { cityDocumentSchema } from "./city";
import { localStart, scheduleOccurrences, DEFAULT_OCCURRENCES, type WalkSchedule } from "./walk-schedule";
import { withEventMeetingPoint, type LocatedOccurrence } from "./event-location";

const isoDate = z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine(value => {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
});
export const recurringPlanSchema = z.object({
  version: z.literal(1), owner: z.string().regex(/^[0-9a-f]{64}$/), cityId: z.string().uuid(),
  seriesId: z.string().uuid(), firstDate: isoDate,
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), timeZone: z.string().min(1).max(100),
  frequency: z.enum(["weekly", "fortnightly"]), weekday: z.number().int().min(0).max(6),
  paused: z.boolean(), skippedDates: z.array(isoDate).max(200),
  meetingPoint: cityDocumentSchema.shape.meetingPoint,
});
export type RecurringPlan = z.infer<typeof recurringPlanSchema>;

function parsePlan(value: unknown): RecurringPlan {
  const result = recurringPlanSchema.safeParse(value);
  if (result.success) return result.data;
  const field = result.error.issues[0]?.path[0];
  const messages: Record<string, string> = {
    firstDate: "Choose a valid start date using the date picker (2000–2099).",
    localTime: "Choose a valid start time.",
    meetingPoint: "Add a meeting-point description and choose a valid map location.",
    skippedDates: "A skipped date is invalid. Please review your recurring plan.",
    weekday: "Choose a weekday for your recurring walk.",
    frequency: "Choose weekly or fortnightly recurrence.",
  };
  throw new Error(messages[String(field)] ?? "The recurring plan contains invalid details. Please review it before saving.");
}

/** Derived drafts have stable IDs. No timer/server job is required to reconstruct
 * missed weeks: the saved recurrence is the source of truth, never a moving anchor. */
export function upcomingDrafts(rawPlan: RecurringPlan, now = Date.now()): LocatedOccurrence[] {
  const plan = parsePlan(rawPlan);
  if (!Number.isFinite(now)) throw new Error("Invalid current time.");
  if (plan.paused) return [];
  // Validate the actual IANA zone and time without depending on device TZ.
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: plan.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now)).map(p => [p.type, p.value]));
  const today = Date.parse(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  const dayMs = 86_400_000;
  let anchor = Date.parse(`${plan.firstDate}T00:00:00Z`);
  anchor += ((plan.weekday - new Date(anchor).getUTCDay() + 7) % 7) * dayMs;
  const interval = (plan.frequency === "weekly" ? 7 : 14) * dayMs;
  let cursor = anchor + Math.max(0, Math.floor((today - anchor) / interval)) * interval;
  const skipped = new Set(plan.skippedDates);
  const occurrences = [];
  // Bounded scan: fail visibly rather than claiming a full eight when exclusions
  // or the scheduling horizon make the window impossible.
  for (let scanned = 0; scanned < 230 && occurrences.length < DEFAULT_OCCURRENCES; scanned++, cursor += interval) {
    const date = new Date(cursor).toISOString().slice(0, 10);
    if (skipped.has(date)) continue;
    const start = localStart(date, plan.localTime, plan.timeZone);
    if (start * 1000 <= now) continue;
    const schedule: WalkSchedule = { ...plan, firstDate: date, frequency: "once", count: 1, durationMinutes: 60 };
    occurrences.push(...scheduleOccurrences(schedule, now));
  }
  if (occurrences.length !== DEFAULT_OCCURRENCES) throw new Error("Could not prepare eight upcoming drafts. Review your schedule.");
  return withEventMeetingPoint(occurrences, plan.meetingPoint);
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;
function planKey(owner: string, cityId: string) {
  if (!/^[0-9a-f]{64}$/.test(owner) || !z.string().uuid().safeParse(cityId).success) throw new Error("Invalid draft owner or city.");
  return `bitcoinwalk:recurring-plan:v1:${owner}:${cityId}`;
}
export function readRecurringPlan(storage: StorageLike, owner: string, cityId: string): RecurringPlan | null {
  const raw = storage.getItem(planKey(owner, cityId));
  if (!raw) return null;
  if (raw.length > 20_000) throw new Error("Saved plan is too large; no drafts loaded.");
  let decoded: unknown;
  try { decoded = JSON.parse(raw); }
  catch { throw new Error("The saved recurring plan could not be read. It has not been changed."); }
  const plan = parsePlan(decoded);
  if (plan.owner !== owner || plan.cityId !== cityId) throw new Error("Saved plan belongs to a different organizer or city.");
  return plan;
}
export function saveRecurringPlan(storage: StorageLike, plan: RecurringPlan) {
  const valid = parsePlan(plan);
  storage.setItem(planKey(valid.owner, valid.cityId), JSON.stringify(valid));
}
