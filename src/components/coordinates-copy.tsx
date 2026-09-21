"use client";

import { useState } from "react";

export default function CoordinatesCopy({ latitude, longitude }: { latitude: number; longitude: number }) {
  const [message, setMessage] = useState("");
  const coordinates = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

  async function copyCoordinates() {
    try {
      await navigator.clipboard.writeText(coordinates);
      setMessage("Copied to Clipboard! Open the map on your device and paste the meeting point coordinates");
    } catch {
      setMessage("Could not copy the coordinates. Please select and copy them manually.");
    }
  }

  return (
    <section>
      <p>Coordinates: <button type="button" onClick={copyCoordinates} aria-label={`Copy meeting point coordinates ${coordinates}`}>{coordinates}</button></p>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
