"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import CoordinatesCopy from "../../../components/coordinates-copy";
import CityChat from "../../../components/city-chat";
import { relayConfig } from "../../../lib/relay-config";
import { queryApprovals, queryCityRevisions, resolveApprovedCity } from "../../../nostr/city-records";
import { authenticateWithBrowserExtension } from "../../../nostr/signer";

type Preview = {
  cityId: string;
  slug: string;
  cityName: string;
  startAt: string;
  description: string;
  meetingPoint: string;
  latitude: number;
  longitude: number;
  heroImageUrl?: string;
} | null;

export default function AuthenticatedCityPreviewPage() {
  const params = useParams<{ city: string }>();
  const city = params.city;
  const [preview, setPreview] = useState<Preview>(null);
  const [message, setMessage] = useState("Connect your Nostr signer to load this private relay preview.");

  async function loadPreview() {
    if (relayConfig.readRelays.length === 0) {
      setMessage("The BitcoinWalk relay is not configured.");
      return;
    }
    try {
      setMessage("Authenticating with the relay…");
      const [revisions, approvals] = await Promise.all([
        queryCityRevisions(relayConfig.readRelays, authenticateWithBrowserExtension),
        queryApprovals(relayConfig.readRelays, authenticateWithBrowserExtension),
      ]);
      const approved = resolveApprovedCity(revisions, approvals, city);
      if (!approved) {
        setMessage(`No approved BitcoinWalk named “${city}” was found.`);
        return;
      }
      setPreview({
        cityId: approved.city.cityId,
        slug: approved.city.slug,
        cityName: approved.city.cityName,
        startAt: approved.city.startAt,
        description: approved.city.description,
        meetingPoint: approved.city.meetingPoint.description,
        latitude: approved.city.meetingPoint.latitude,
        longitude: approved.city.meetingPoint.longitude,
        heroImageUrl: approved.city.heroImageUrl,
      });
      setMessage("Verified approved city record loaded from the relay.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load the private relay preview.");
    }
  }

  return (
    <main>
      <p>BitcoinWalk / private preview</p>
      <h1>{city}</h1>
      <button type="button" onClick={loadPreview}>Connect and load preview</button>
      <p role="status">{message}</p>
      {preview && (
        <article>
          <h2>BitcoinWalk {preview.cityName}</h2>
          {preview.heroImageUrl&&<img className="hero-image" src={preview.heroImageUrl} alt={`BitcoinWalk ${preview.cityName}`} />}
          <p>{new Date(preview.startAt).toLocaleString()}</p>
          <p>Meeting point: {preview.meetingPoint}</p>
          <CoordinatesCopy latitude={preview.latitude} longitude={preview.longitude} />
          <p>{preview.description}</p>
          <CityChat cityId={preview.cityId} slug={preview.slug} />
        </article>
      )}
    </main>
  );
}
