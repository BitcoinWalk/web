# Public future-events API

`GET /api/events` is the versioned, read-only BitcoinWalk feed for third-party applications. It returns only upcoming walks belonging to a currently approved city and accepted by the same signed Nostr validation used by public walk pages.

The public integration index at `/dev` also exposes the same verified dataset as:

- `GET /events.ics` — an RFC 5545 iCalendar subscription with RFC 7986 event images;
- `GET /events.xml` — an RSS 2.0 feed with BitcoinWalk event fields, WGS84 coordinates and Media RSS images.

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

All formats are projections, never independent records. The signed Nostr occurrence, current city approval, moderation state and current sponsor coverage remain authoritative.

## Approved city directory

`GET /api/cities` is the companion app's versioned, read-only city selector. It
returns every currently approved city, including cities with no future walk, and
does not expose owners, payment records, private relay details or moderation
history.

```json
{
  "version": 1,
  "generatedAt": "2026-10-13T12:00:00.000Z",
  "cities": [
    {
      "id": "approved-city-id",
      "name": "Madeira",
      "slug": "madeira",
      "aliases": [],
      "canonicalUrl": "https://bitcoinwalk.org/madeira",
      "chat": {
        "scope": "global",
        "url": "https://bitcoinwalk.org/join",
        "nip29": {
          "relay": "wss://chat.bitcoinwalk.org",
          "groupId": "13bc3a423b4f2954"
        }
      }
    }
  ]
}
```

The chat URL and NIP-29 destination are operator-controlled verified routing
data. The public destination contains only the exact relay and group ID needed
by a compatible client; it contains no owner, payment or private-relay data.
Free cities may use the verified global community during migration. A paid city
whose dedicated NIP-29 group has not passed provisioning and read-back returns
`{"scope":"city","url":null,"nip29":null}`; it never falls back to the global
room. Like `/api/events`, a failed authoritative read returns HTTP 503 rather
than a partial directory.
