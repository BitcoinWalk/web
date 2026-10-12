# Public future-events API

`GET /api/events` is the versioned, read-only BitcoinWalk feed for third-party applications. It returns only upcoming walks belonging to a currently approved city and accepted by the same signed Nostr validation used by public walk pages.

## Response

```json
{
  "version": 1,
  "generatedAt": "2026-11-01T00:00:00.000Z",
  "events": [
    {
      "id": "signed-nostr-event-id",
      "name": "BitcoinWalk Asunción",
      "description": "A friendly walk and conversation about Bitcoin.",
      "startDate": "2026-11-07T18:00:00.000Z",
      "endDate": "2026-11-07T20:00:00.000Z",
      "timeZone": "America/Asuncion",
      "link": "https://bitcoinwalk.org/asuncion/nevent1...",
      "address": "Example Café, Asunción",
      "latitude": -25.2637,
      "longitude": -57.5759,
      "image": "https://bitcoinwalk.org/api/og/files/....jpg"
    }
  ]
}
```

`id` is the immutable signed Nostr event ID. `link` is the canonical BitcoinWalk occurrence page. `image` is generated through the same 1200 × 630 content-addressed OG pipeline as the public page and includes approved, currently covered sponsor artwork when applicable. The signed NIP-52 record currently stores one free-text meeting point, exposed as `address`; the optional `venue` field is reserved for a future separately structured venue value.

The endpoint allows cross-origin GET requests and is cacheable for 60 seconds, with five minutes of stale-while-revalidate. It returns HTTP 503 rather than a partial or falsely empty list when authoritative relay reads or sponsor resolution cannot be completed.
