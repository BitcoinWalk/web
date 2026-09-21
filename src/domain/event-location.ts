import { cityDocumentSchema, type CityDocument } from "./city";
import type { WalkOccurrence } from "./walk-schedule";

export type LocatedOccurrence = WalkOccurrence & { meetingPoint: CityDocument["meetingPoint"] };

/** Copy into each occurrence; never mutate the city default or share a mutable location. */
export function withEventMeetingPoint(occurrences: WalkOccurrence[], meetingPoint: CityDocument["meetingPoint"] | null): LocatedOccurrence[] {
  const parsed = cityDocumentSchema.shape.meetingPoint.safeParse(meetingPoint && { ...meetingPoint, description: meetingPoint.description.trim() });
  if (!parsed.success) throw new Error("Enter a meeting-point description and choose a valid map pin for this walk.");
  return occurrences.map(occurrence => ({ ...occurrence, meetingPoint: { ...parsed.data } }));
}
