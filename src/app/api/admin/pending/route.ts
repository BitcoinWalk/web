import { NextResponse } from "next/server";
import { relayConfig } from "../../../../lib/relay-config";
import { pendingCityRevisions, queryApprovals, queryCityRevisions } from "../../../../nostr/city-records";

export async function GET() {
  if (relayConfig.readRelays.length === 0) return NextResponse.json({ configured: false, submissions: [] });
  const [revisions, approvals] = await Promise.all([queryCityRevisions(relayConfig.readRelays), queryApprovals(relayConfig.readRelays)]);
  return NextResponse.json({
    configured: true,
    submissions: pendingCityRevisions(revisions, approvals).map(({ event, city }) => ({
      eventId: event.id,
      cityId: city.cityId,
      cityName: city.cityName,
      startAt: city.startAt,
      meetingPoint: city.meetingPoint.description,
    })),
  });
}
