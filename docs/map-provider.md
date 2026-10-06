# Map provider and organizer fallback

The organizer picker and public directory use OpenFreeMap's keyless OSM-derived
vector service through MapLibre GL and the existing Leaflet interaction layer.
The maintained style URL is `https://tiles.openfreemap.org/styles/liberty`.
Visible attribution names OpenFreeMap, OpenMapTiles and OpenStreetMap.

This replaces direct use of OpenStreetMap's volunteer raster tile servers. The
staging domain received their explicit 403 policy-block tiles on 28 September
2026. City search now uses the separately rate-limited, cached server-side
Photon integration (0.3.175); changing the map renderer does not change search or send
meeting-point descriptions to the tile provider.

MapLibre 6 uses an ESM worker and shared module. `predev` and `prebuild` copy the
two matching files from the pinned package into ignored `public/maplibre/`
assets, and the client sets the worker to the same-origin URL. Do not copy just
the worker: it imports the shared module by relative path.

The meeting pin, click and drag behavior remain Leaflet-owned. A collapsed
manual-coordinate fallback is always available below the map, and a provider
error message appears after repeated vector-rendering failures. This lets an
organizer continue without guessing against a blank map.

Acceptance:

1. Search for Piaseczno and select the first result.
2. Confirm the map zooms to Piaseczno, renders roads/labels, and shows the pin.
3. Click or drag the pin and confirm the displayed coordinates change.
4. Expand the fallback, apply valid coordinates, and reject out-of-range values.
5. Confirm the public directory map renders with the same provider and that no
   request targets `tile.openstreetmap.org`.

Staging acceptance passed on 28 September 2026 with app 0.3.80. Piaseczno
explicit city search returned the expected Polish city results; selecting the first
result zoomed to the city, rendered the meeting pin at `52.074738, 21.027089`,
showed OpenFreeMap/OpenMapTiles/OpenStreetMap attribution, and populated the
manual-coordinate fallback. The packaged and live same-origin MapLibre worker
and shared-module assets were also verified.

## Photon autocomplete (BW-31)

The new-city City field searches after 650ms without typing (minimum two
characters). Stale requests and pending retries are aborted; selecting a result
does not trigger another search. Arrow keys/Enter select suggestions and Escape
closes them. Enter and manual map-pin/coordinate entry remain available.
IME composition is not submitted until complete. English/Latin names retain
diacritics; labels include county, region and country. Only cities, towns,
villages and hamlets are accepted, not businesses or street addresses.

The server defaults to `https://photon.komoot.io/api/`. Override with the
server-only `PHOTON_SEARCH_URL` environment variable for a compatible HTTPS
Photon endpoint. The old `GEOCODE_SEARCH_URL` is deliberately ignored to avoid
accidentally sending autocomplete traffic to public Nominatim. No Nominatim
fallback is used. A single app process enforces 1.1-second global spacing,
one upstream request at a time and a bounded 24-hour cache. The browser retries
a 429 once after two seconds; no unlimited retry/queue is created. Share the
limiter/cache before running multiple app replicas.

This is a modest-usage staging trial on Photon's public demo, not an SLA-backed
production dependency. No Photon database was installed on either VPS.
Production needs a separate hosting/capacity decision. Display attribution to
Photon and OpenStreetMap; only the typed city query is sent upstream.
Reference: https://github.com/komoot/photon and its docs/api-v1.md.

0.3.176 refines this into an anchored input dropdown, not separate result
buttons. At most five compact rows show city and region/country. Existing
suggestions narrow immediately as letters are added while a debounced request
refreshes matches. Search city was removed; Photon/OSM credits moved to the
registration page footer. Backup: `/home/bitcoinwalk/backups/app-staging-deploy.jPXlI7`.
733 tests and build/package smoke passed.

Deployed as non-root bitcoinwalk on 6 October 2026. Backup/evidence:
`/home/bitcoinwalk/backups/app-staging-deploy.nqJNjX`. All 731 tests passed,
along with type-check/build, lint (four existing warnings), packaged smoke and
backlog checks. Live browser acceptance: Piaseczno suggestions appeared without
Search, Down/Enter selected the city at 52.074738, 21.027089, map tiles rendered,
and clicking the map updated the pin to 52.073932, 21.034388. No city was submitted.
