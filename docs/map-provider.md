# Map provider and organizer fallback

The organizer picker and public directory use OpenFreeMap's keyless OSM-derived
vector service through MapLibre GL and the existing Leaflet interaction layer.
The maintained style URL is `https://tiles.openfreemap.org/styles/liberty`.
Visible attribution names OpenFreeMap, OpenMapTiles and OpenStreetMap.

This replaces direct use of OpenStreetMap's volunteer raster tile servers. The
staging domain received their explicit 403 policy-block tiles on 28 September
2026. City search remains the separately rate-limited, cached server-side
Nominatim integration; changing the map renderer does not change search or send
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
