# BW-104 — city profile artwork

Implemented and visually accepted 7 October 2026. BW-104 is Done; live setup integration remains BW-105.

`src/logos/profile-artwork.ts` composes an original approved hero with the existing transparent `bitcoinwalk-on-black` city-logo variant. It produces a 1024×1024 avatar and 1500×500 banner. The avatar mark fits entirely inside a conservative circle-safe square. A neutral dark background is available when there is no approved hero. A corrupt supplied image fails rather than silently publishing replacement artwork. Sources are bounded, still raster images; SVG, animation and remote downloads are not accepted.

The store takes the persistent `BITCOINWALK_MEDIA_ROOT` and canonical public HTTPS origin. It writes content-addressed WebP files served by the existing `/api/media/files/<hash>.webp` route, plus private version/source-key manifests. Cache keys cover city, approved revision, original artwork, logo, renderer version and imaging-library versions. Exact concurrent work is coalesced; corrupt/missing cached assets are regenerated. Old content-addressed assets remain available to already-signed profiles. Image metadata is stripped. Back up both `files` and `profile-artwork` with the existing persistent media volume; do not use the temporary development root in production.

## Integration boundary

This is an internal renderer/store, not an authenticated provisioning endpoint. A caller **must** resolve the latest approved city revision and its exact ready logo pack, verify the actor's current authority/Pro eligibility, and load only integrity-checked managed hero bytes. Supplying a revision ID to this library does not prove approval. Instantiate one shared store per worker to apply its concurrency bound; endpoint rate limits and per-city job deduplication belong to activation.

BW-105 must show the returned avatar/banner before requesting the city account's kind-0 profile signature. New approved hero/name/logo changes create a new preview, not an automatic profile mutation. NIP-05/LNURL inclusion still requires independently verified endpoint provisioning. No keys, identity binding, financial setup, Nostr publication or public Hosted-by replacement happen here.

## Visual acceptance

The user approved the first avatar variant with the city-photo background on 7 October 2026. Use each city's own approved hero behind its BitcoinWalk logo and city name as the standard appearance. The neutral background is only a missing-hero fallback, not the preferred design. This approval does not publish or change any live profile.

Run `node scripts/preview-city-profile.mjs` to produce an isolated temporary review sheet and individual WebP assets. The sheet shows Warszawa with its bundled hero, Szydłowiec for accented lettering, and Frankfurt am Main for a long name with the neutral fallback. Circular previews are 240, 96 and 48 pixels; banners are reduced to 600×200. These are fixtures, not approved production profile changes.

The current template preserves the complete city name without clipping. At 48px long names are not legible; the icon remains recognizable. This remains a documented small-size limitation, not a claim that all names are readable at every client size. The approved photo-background design is the accepted baseline; no compact multi-line redesign is required for this item.

Tests cover dimensions, deterministic output, metadata removal, circular safety, source validation, hero preservation, concurrent retries, corruption repair, revision/source invalidation and public URL shape. There is no live account setup UI or staging deployment in this isolated artwork change.

Verification: all 782 tests pass, plus typecheck, changed-file ESLint, production build and backlog validation. Repository-wide ESLint still fails on existing generated `.cjs` bundles; these unrelated files were not changed.
