# Public directory — accepted 29 September 2026

Local homepage: http://localhost:3000/ — staging only, not production deployed.

Searchable approved city cards, list/map toggle with approved meeting-point pins,
hero-image fallback, local date/time, city-page links and a featured paid-city section.
Dates in the past are labeled as last published, not advertised as upcoming.
The live staging public relay read returned ten approved cities (including test
cities). Browser confirmed that all ten cards render. No signatures or relay
writes were made during acceptance.

The directory pages revision and super-admin decision history with inclusive
timestamp boundaries, deduplicates IDs, and fails closed on stalled/oversized reads.
It uses the existing retained-approval resolver: pending/rejected alternative edits
do not replace the public walk; revoked or missing selected revisions are excluded.
Duplicate slug collisions are omitted pending admin resolution. On read errors,
the page offers a manual retry, never a misleading successful empty directory.

## Featuring paid cities and sponsors

`src/lib/directory-config.ts` is an operator-controlled city-UUID registry. Entries
must match the approved slug, mark `featured`, and separately mark `subdomainReady`
before routing to the city subdomain. Neither sponsor presence nor chatUrl is
proof of payment. The synthetic Austin pilot is not included as a paid customer.
Registry is currently empty, so a clear placeholder appears in the featured area.

Featured cards use sponsor name/logo/offer from the approved city document. Only
HTTPS images without URL credentials are displayed; browser requests use no-referrer
and have broken-image fallbacks. No sponsor claims are invented. Madeira/Trezor was
the user's illustrative example; confirmation of real partnerships is pending.
Sponsor entry/approval management, entitlement automation and separate paid-relay
discovery/index replication remain BW-16/BW-17/BW-23 work. They do not block the
public-directory acceptance: without a genuine entitlement the safe, expected state
is the clearly labelled empty featured section. This directory reads the configured
city-record relay; it does not discover arbitrary paid relays automatically.

## Verification

Automated cases cover pending, rejected/revoked/missing revisions, trusted paid
routing, search and URL sanitation. On 29 September, live app `0.3.81` browser
acceptance showed ten approved cards; city-alias search (`Warsaw`) returned Warszawa;
meeting-point search (`coffee shop`) returned Chicago and Memphis; and an unknown
query produced the clear zero-result state. Map mode rendered ten pins, a Radom
filter reduced the map to one pin, and the Chicago popup showed its meeting point
and linked to `/chicago`. OpenFreeMap/OpenMapTiles/OpenStreetMap attribution was
present and map imagery loaded. The empty featured-city state was also confirmed.

Production revalidation is tracked under BW-53. Genuine paid-city and sponsor
activation remains BW-16/BW-17/BW-23. Custom design is still a later stage;
components and configuration are separated for restyling. Legacy site and chat
remain untouched.
