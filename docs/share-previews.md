# BW-15: link previews

## Automatic approved-logo preview: 0.3.151

Sponsor selection now renders a current approved logo without attempting an unsolicited background Nostr signature. The read-only content-addressed endpoint serves an intact PNG only while its hash is referenced by a current, signature-verified sponsor assignment; invalid, pending, obsolete, missing and unreferenced hashes fail closed. Responses are no-store and `nosniff`. Trezor's live asset `4c061d…cc3a` was read back with a matching SHA-256, while an unapproved hash returned 404. The visible **Upload and replace logo** action remains alongside the preview and retains explicit upload/review signatures.

Deployed non-root on 5 October 2026 with backup `/home/bitcoinwalk/backups/app-staging-deploy.GROCck`. 645 tests, production build, package smoke, live approved read-back and unapproved denial passed. Interactive selection/replacement acceptance remains with the user.

## Reusable sponsor replacement and merged preview: 0.3.150

Removed the requirement to save a new target assignment before replacing an existing sponsor's artwork. Catalogue selection retains the exact source assignment, so the super-admin can preview and upload/review a replacement immediately; logo approval still signs a successor to that source assignment and is never inferred from upload. **Create merged image** composes the currently selected approved city's managed hero with the BitcoinWalk mark, pinned Powered by label and exact integrity-checked sponsor logo. It requires signed super-admin authorization, returns a content-addressed 1200×630 JPEG, and does not publish or modify a sponsorship assignment.

Added BW-91 for a genuine signed sponsor catalogue/self-registration and manual intake, because the current catalogue remains derived from signed sponsorship assignments. Added BW-92 for expiring, revocable sponsor invitations from settled Pro-city organizers whose `bitcoinwalk.org` NIP-05 is currently verified. Deployed non-root on 5 October 2026 with backup `/home/bitcoinwalk/backups/app-staging-deploy.ERZBda`. 641 tests, targeted lint, production build, backlog generation, package smoke, live health and unsigned-access denial passed. Interactive signature, replacement and merged-image acceptance remain with the user.

## Automatic sponsor preview: 0.3.149

Selected saved logos load automatically with signed super-admin preview authorization (the extension may prompt), byte-hash verification, stale-selection guards and an explicit retry after errors. A visible “Upload and replace logo” button opens the existing upload/review controls, reset on selection changes; no approval is automatic. Deployed non-root on 5 October 2026 with backup `/home/bitcoinwalk/backups/app-staging-deploy.wNj4X1`. 639 tests, production build and packaged smoke passed. Interactive signer acceptance remains with the user.

## Sponsor selection: 0.3.148

Sponsor Name lookup above npub reuses the newest current signed assignment per sponsor: saved npub, website and logo hash are prefilled. Optional public profile names label search results; website/npub remain usable if profiles are unavailable. Selection does not publish anything; explicit assignment signing approves reuse of the exact hash. Editing npub clears the previous website and logo selection. Cleared assignments do not supply catalog entries.

Removed the profile-website import button and standalone Logo artwork section. Private preview and upload/replacement controls are inline with sponsor details. Preview requests require a super-admin signature and hash verification. Replacement still requires a saved matching assignment and explicit logo approval. Deployed non-root on 5 October 2026; backup `/home/bitcoinwalk/backups/app-staging-deploy.Dsgrko`. 637 tests, targeted lint, production build and packaged smoke passed. The agent did not sign sponsor changes.

## Sponsors layout cleanup: 0.3.147

Removed the introductory breadcrumb, Sponsors title, description, jump links, idle status and top Refresh button. The page starts with “Assign Existing Sponsor”; action/error feedback remains within that section. Deployed non-root on 5 October 2026 with backup `/home/bitcoinwalk/backups/app-staging-deploy.8u0HsB`. All 634 tests, production build and packaged smoke checks passed.

## Sponsor controls and private asset library: 0.3.146

Deployed as non-root `bitcoinwalk` on 5 October 2026. Backup: `/home/bitcoinwalk/backups/app-staging-deploy.OB7CHD`. 633 tests, production build, targeted lint and packaged smoke checks passed. Authenticated preview/signing remains a user acceptance check; the agent did not sign admin requests or alter sponsor approvals.

Assignments use a City / Individual Walk radio toggle, the existing CityFinder lookup and Display radio buttons. Logo artwork is always labelled; upload/review controls require a saved sponsor assignment, with guidance shown otherwise. Jump links lead directly to artwork and the library.

The super-admin asset library combines current signed logo references with private upload manifests. Filter by city and search sponsor profile name, npub, hex public key or approved website. Loading uploads and previews uses explicit signed, short-lived admin authorization; responses are no-store. Preview bytes are hash-checked server-side and client-side. Browsing does not stage, approve or publish artwork. Pending manifests are never treated as approval; status is derived from current signed assignments. Historical unreferenced staged hashes are not presented as approved. Profile names are optional labels, not identities or imported logos.

## Unified Sponsors page: 0.3.145

Deployed non-root on 4 October 2026. Backup: `/home/bitcoinwalk/backups/app-staging-deploy.sIOJ9s`. Assignments, upload and review are now on `/admin/sponsors`: select a city/walk once, then manage artwork for its saved sponsor assignment. The three former upload/review URLs redirect here. Signing and approval remain explicit super-admin actions. 624 tests, production build and packaged route/authorization smoke checks passed.

The OG composition now places the sponsor directly over the city photograph without an added rectangular plate. “Powered by” is rendered from the pinned brand font at build time to avoid missing server fonts; cache version v4 regenerates the image without overwriting existing immutable URLs.

## Admin consolidation: 0.3.144

Deployed non-root on 4 October 2026, with backup `/home/bitcoinwalk/backups/app-staging-deploy.YYXzof`. Upload and review now live under Admin → Sponsors; `/sponsor/logo` redirects to `/admin/sponsors/upload`. Both dashboard subroute access and upload API authorization require the super-admin. Fixed nested sponsor route access so authenticated super-admins can reach review/upload. 621 tests, build and packaged smoke checks passed; the public redirect and account gates were verified after deployment. No sponsor assignment or stored artwork was changed.

## Staging release 0.3.143 (4 October 2026)

Deployed as `bitcoinwalk` (UID 1000), after the user activated relay 0.8.59. App evidence/backup: `/home/bitcoinwalk/backups/app-staging-deploy.l8Ca95`. Relay backup: `/var/backups/bitcoinwalk-sponsor-logo-policy.3JHMgx`. App archive SHA-256: `51fea27aebc1623d646cd782af66d47eac53319257160d092e8af8e3c53dac1a`.

616 app tests passed on Node 24.21.0, along with production build and packaged smoke checks. The live health endpoint reports 0.3.143. Barcelona and Warszawa metadata returned public JPEGs with matching content hashes; Warszawa redirected to its upcoming walk with a timezone-correct title. Sponsor upload/review endpoints rejected unsigned requests with 401/403. Browser checks confirmed the upload page and protected admin review route. No real logo upload or signed approval was performed by the agent; that acceptance remains with the user.

## Metadata and image generation

City and event metadata use approved relay records. Event titles include the city and scheduled local date; descriptions include local time and meeting point. Past events are labelled explicitly. Editorial targets are roughly 50–65 title characters and 140–160 description characters, not guarantees of platform display width. Event titles allow up to 80 characters to retain the date; long content is shortened at word boundaries.

Images are 1200×630 JPEGs composed on the server from an integrity-checked managed city background and the approved white BitcoinWalk symbol (280×280 bounding box). External event URLs are not fetched. Missing artwork uses a neutral branded background. Output is content-addressed and saved under `BITCOINWALK_MEDIA_ROOT/og`; configure that root on persistent storage. The existing temporary-directory fallback is for local development only. `BITCOINWALK_PUBLIC_ORIGIN` defaults to staging and must be set to `https://bitcoinwalk.org` at launch.

Generation currently happens on the first metadata request; identical work is coalesced and reused. A packaged static fallback keeps tags usable if rendering/storage fails. Metadata reads do not publish or alter Nostr events. City redirects to the next walk remain unchanged. Static content routes keep their own copy.

## Sponsor intake

Logo upload is part of **Admin → Sponsors**, at `/admin/sponsors`, below the selected saved sponsor assignment. Legacy upload URLs redirect here. Only the super-admin may upload artwork, enforced both by dashboard access and signed API authorization. The request signs the exact file hash, MIME, city and sponsor identity. `/api/sponsors/logo` verifies these independently before storing a normalized PNG privately under `BITCOINWALK_MEDIA_ROOT/sponsor-pending`. Uploads never confer approval, publish Nostr events, or change the OG image.

PNG/WebP uploads are limited to 5 MB; SVG to 512 KB. Content decoding must match the declared type. Animated images, JPEG, SVG scripts/resources/styles/fonts/text and unsupported effects are rejected. SVG must use outlined shapes with explicit colours. Raster input is pixel-limited; processing has a timeout and concurrency limit. Each city/sponsor pair has one replaceable pending file with a one-minute replacement interval, and its metadata records the uploader and signed request ID. No public file-serving route exists for pending artwork.

## Approval and composition

The super-admin selects a signed assignment on `/admin/sponsors` and loads pending artwork in the review section using a signed admin-only request. The browser verifies the PNG's SHA-256 against the review response. Loading a review stages an immutable private copy; it does not approve it. The administrator then signs a version 2 sponsorship successor containing `logoHash`. The existing relay predecessor and authority checks still apply. Removing a logo signs a successor without the hash; clearing the sponsor suppresses all artwork. Normal assignment edits retain the hash only when the sponsor identity is unchanged.

Public metadata resolves the current sponsorship and global feature flag before reading a hash-verified asset. Walk overrides, expiry, hidden/empty modes and clearing suppress inherited artwork as appropriate. Missing/corrupt files or failed reads produce an unsponsored preview. No avatar URLs are fetched. Sponsored compositions place the BitcoinWalk symbol above transparent Powered by lettering and approved artwork directly on the photograph. Cache keys include the exact background, brand, caption and sponsor bytes; removing/changing a logo changes the preview URL. Previously shared third-party cached images cannot be forcibly recalled.

### Deployment order

1. Deploy the backward-compatible relay sponsorship parser (`../bw56-relay/sponsorship.go`) that accepts v1 and v2. The old deployed 0.8.58 parser rejects v2; do not offer logo approvals against it.
2. Deploy the web app and ensure the persistent media root preserves both `sponsor-pending` and `sponsor-assets`, alongside `og`.
3. Upload a real sponsor asset, inspect it, explicitly sign approval, and verify the signed event and resulting public HTML/image. No sponsor approval has been signed by the development agent.

Relay release 0.8.59 is prepared as `bitcoinwalk-sponsor-logo-policy-0.8.59` for the bitcoinwalk account on .138. Its installer verifies the release checksums, stops the relay to back up its databases (including any WAL sidecars), preserves the prior binary/version configuration, and starts the updated relay under the existing non-root service identity. It performs bounded health and version checks. It does not automatically roll back or restore databases. Interactive sudo is required for this system service; the web app remains a separate non-root deployment after relay acceptance.

## Remaining implementation and acceptance

1. Signed staging browser acceptance of intake and admin review/approval.
2. Signed read-back acceptance of the v2 hash binding (relay/app release and backup completed).
3. User visual approval using the actual Barcelona sponsor asset, not a placeholder.
4. Regeneration/prewarming after relevant approvals and changes; retention policy for obsolete content-addressed images.
5. Staging HTML/crawler checks and visual approval for sponsored/unsponsored, missing-image, long-name and timezone cases. No production rollout before acceptance.

Generate the two checked-in brand derivatives with `node scripts/build-share-brand.mjs` when the original brand artwork changes. The preview mark uses the approved “bitcoinwalk on black” white symbol, cropped without the city wordmark or circular background. Sponsor upload restrictions do not prohibit JPEG as the final flattened OG image format.
