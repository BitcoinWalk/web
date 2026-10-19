"use client";

import { useState } from "react";

export default function CoordinatesCopy({ latitude, longitude }: { latitude: number; longitude: number }) {
  const [message, setMessage] = useState("");
  const coordinates = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

  async function copyCoordinates() {
    try {
      await navigator.clipboard.writeText(coordinates);
      setMessage("Coordinates copied.");
    } catch {
      setMessage("Could not copy the coordinates. Please select and copy them manually.");
    }
  }

  return (
    <div className="meeting-point-actions">
      <a href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`} target="_blank" rel="noopener noreferrer">Open map ↗</a>
      <button type="button" onClick={copyCoordinates} aria-label={`Copy meeting point coordinates ${coordinates}`}>Copy coordinates</button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
