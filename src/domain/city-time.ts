import tzLookup from "@photostructure/tz-lookup";

/** Resolve locally from the approved city meeting point. Never use device timezone. */
export function cityTimeZone(point: { latitude: number; longitude: number }): string {
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) {
    throw new Error("The city's map location is invalid. Update its meeting point before scheduling walks.");
  }
  const zone = tzLookup(point.latitude, point.longitude);
  // Fail closed if the runtime's timezone database does not recognize the zone.
  try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(0); }
  catch { throw new Error("Could not determine local time for this city. Please contact BitcoinWalk support."); }
  return zone;
}
