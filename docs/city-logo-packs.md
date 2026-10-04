# Automated city logo packs: implementation plan (BW-82)

## Current agreed scope — 3 October 2026

This section supersedes the manual ZIP workflow below. The user will not supply
exports. Generate a pack after every verified super-admin approval, for both
Basic and Pro cities. Start with Warszawa for existing-city acceptance; do not
bulk-backfill the rest without a separate request.

Publish at `app-staging.bitcoinwalk.org/<city>/logo`. Only paid cities expose
links in city pages and organizer UI for now. Free-city packs exist at the same
route but remain unlisted, with no sitemap entry and noindex on page/download
responses. This is discoverability control, NOT authorization or confidentiality.
Super-admin can see all statuses. Tier selection alone is insufficient: use the
existing verified settlement/entitlement source. A paid upgrade reveals an
already-ready pack, without regenerating it.

## Inkscape migration decision — 3 October 2026

Figma is no longer a runtime or paid-plan dependency. The accepted Figma work
is migration evidence only. The maintained source of truth will be a versioned
SVG template bundle that opens in Inkscape, with the exact Ubuntu Bold Italic
font and licence stored beside it. The approval worker will render that bundle
locally on the VPS; it will not call Figma, Framer or another hosted editor.

All ten approved PNGs for Warszawa, Radom and Szydłowiec are now preserved
byte-for-byte inside locked, self-contained Inkscape SVG reference masters under
`design/city-logo-templates/v1/reference-masters/`. Source checksums, dimensions
and rendered-pixel parity passed. The exact font and licence are in
`design/city-logo-templates/v1/fonts/`. Five partial Figma layout captures are
retained as evidence.

Figma's SVG export outlined every label, so it could not be the editable text
source. The reviewed masters under `editable-masters/` instead preserve the
approved brand pixels in a locked layer and replace only the measured city label
with live Ubuntu Bold Italic text. This is deliberately not described as a fully
vector logo. Short Radom labels, the Warszawa baseline and the longer
Szydłowiec label retain their independently measured width and font size. Source
corner pixels determine whether the replaced label region is transparent or
opaque; filename suffixes are not trusted for that decision. Thirty reference
and thirty editable masters passed safety, dimension, immutable-brand-pixel and
bounded rendered-difference checks. BW-83 is accepted without a Figma plan or
runtime dependency.

## Architecture and sequencing

1. **BW-83 — migrate and publish the Inkscape template.** Preserve the accepted
   Figma exports and geometry as immutable references, reconstruct ten clean SVG
   layouts in Inkscape, and bind the exact font, artwork, sizing and fitting rules
   into a reviewed template version. Figma remains historical evidence only.
   Keep the locked reference separate from editable artwork; do not trace or
   silently approximate a brand mark. Prove Warszawa parity before publication.
2. **BW-84 — unattended generation.** The VPS renders approved city text into
   the reviewed Inkscape-compatible SVG bundle using the bundled licensed font
   and fixed geometry. Measure text width, use approved minimum font sizes,
   validate glyphs and fail for review instead of clipping. Generate PNGs, ZIP
   and a provenance/checksum manifest. SVG downloads are optional only after
   vector and sanitization checks; do not label embedded raster artwork as vector.
3. **BW-85 — reliable approval trigger.** A background reconciliation loop reads
   verified, accepted relay decisions, joins the exact approved city revision and
   enqueues a durable job. A UI success callback may accelerate this but is not
   authoritative. Queue key: city ID + approved name/locale revision + template
   version. Persist state, attempts, lease and last safe error; recover after
   restart and retry transient errors with backoff. Reuse the app's established
   SQLite/persistence conventions after inspecting its schema, with an additive
   migration and backup; no new payment service or mutation of invoice records.
   Approval remains successful while generation is pending or failed. Recheck
   approval before publishing; revocation blocks new publication and withdraws
   served access through the app while retaining artifacts for recovery.
4. **BW-86 — persistent publication and visibility.** Proposed setting:
   `BITCOINWALK_CITY_LOGO_DIR=/home/bitcoinwalk/.local/share/bitcoinwalk/city-logos`
   in the existing owner-only app environment file. Store immutable packs under
   `<cityId>/<packVersion>/`, with a manifest and an atomic current-pack pointer.
   Build in a temporary sibling directory and publish only after all validation
   succeeds; keep the last good pack on failure. Resolve canonical city slugs
   through verified city records, not a hard-coded list. Serve via a bounded
   manifest-only download handler, never arbitrary paths; protect against
   traversal and symlinks, set correct MIME, attachment and nosniff headers.
   Use immutable versioned asset URLs to avoid stale downloads. Runtime storage
   survives release replacement and becomes a mounted Docker volume later.
5. **BW-87 — deploy and accept.** Non-root bitcoinwalk user service/worker on
   .138, one bounded rendering job at a time initially, no new VPS and no sudo
   for routine deployment. Back up the prior release, job data, templates/fonts
   and generated assets. Expose queued/rendering/ready/failed, timestamps and
   authorized retry to super-admin. Verify Warszawa end to end, then fresh paid
   and free approvals with no manual export/redeploy. Move canonical links to
   bitcoinwalk.org only with the production launch.

## Tests and acceptance gates

- Red/green unit tests for template geometry, all ten variants, diacritics,
  long names, invalid names, safe paths and checksums.
- Integration tests for forged/duplicate/stale approvals, durable restart,
  backoff, revocation during rendering, reapproval and concurrent publication.
- Visibility tests for Basic, paid, unpaid Pro request and later paid upgrade;
  no link before a complete pack, and no payment requirement for generation.
- Real Figma-versus-renderer visual comparison, PNG transparency/dimensions,
  complete ZIP, and byte/checksum verification after VPS download.
- Report test counts using red/amber/green. Do not mark the workstream done on
  HTTP health alone. Restore test and a real approval-to-download flow are required.

## Historical Figma platform constraint

Figma REST file endpoints read/export existing nodes; they do not provide general
text mutation. Editor plugins can edit and export, but require user initiation
and cannot run in the background. Thus an editor plugin is suitable for publishing
templates, not as the unattended approval worker. A permanent automated browser
session is not the recommended service dependency. The Inkscape migration above
removes this constraint from normal operation.

Official references checked 3 October 2026:
- https://developers.figma.com/docs/rest-api/file-endpoints/
- https://developers.figma.com/docs/plugins/
- https://developers.figma.com/docs/plugins/api/properties/nodes-exportasync/

## Existing prototype — not deployed

BW-83 acquisition started with `scripts/capture-figma-logo-source.mjs`, which reads the
Warszawa group from the approved working copy, validates all ten variant names,
caption spelling, font styles and geometry, then captures version-pinned PNG
references plus source JSON and checksums into a new immutable directory. It
does not publish assets, change Figma, or claim to be the renderer. Five focused
tests cover completeness, ambiguous captions, geometry and download-origin
validation. The token is read only from `FIGMA_ACCESS_TOKEN`; image downloads do
not receive that token. Responses have size/time limits and redirects are denied.

The Figma integration was connected for one-time source acquisition. All thirty
pilot PNGs were downloaded and packaged locally under `design/city-logo-templates/v1/examples/prototype-packs/` with
ZIPs and checked manifests. ZIP integrity and all pack checksums passed. Five
reusable SVG layouts were captured in
`/home/endo/Work/logo-source/warszawa/template-layouts.partial.json`; the remaining
five calls hit the Figma Starter-plan MCP quota. The accepted references, exact
font and partial geometry are now migrated into the Inkscape source package.
The browser-exported SVGs confirmed that Figma outlines all text; they are not
used at runtime. The completed Inkscape masters keep brand pixels locked and the
city label editable. No new logo deployment or approval job has been enabled.
The next gate is BW-84 unattended rendering, fitting and deterministic pack
generation. No plan upgrade is needed or planned.

## BW-84 renderer implementation — local acceptance

`scripts/render-city-logo-pack.mjs` now provides the non-interactive rendering
boundary. It accepts only an immutable city UUID, bounded NFC city name, safe
canonical slug, valid locale and an explicit output directory. The renderer
uses `city-logo-inkscape-v1.2`, the bundled Ubuntu Bold Italic font and the locked
approved artwork; it never calls Figma or another hosted service.

Version 1.2 clears exactly the one-pixel white artifact inherited from the
historical Figma raster at the top of `bitcoinwalk-on-black` before embedding
the locked artwork. It does not rely on renderer-dependent SVG clipping. The
imported raster remains unchanged as provenance; maintained SVG masters and
generated packs apply the correction. Version 1 and the superseded v1.1 trial
artifacts remain readable for audit and safe transition.

Every non-space character is checked against the font's real `cmap` table before
rendering. Text is measured with the pinned font and its font size is reduced
uniformly until it fits the reviewed region. Horizontal scaling and SVG
`textLength` are not used. A name that cannot fit at the approved minimum fails
for manual review rather than clipping or stretching.

The renderer writes ten transparent PNGs, a deterministic stored ZIP and a
SHA-256 manifest into a temporary sibling directory, validates dimensions and
alpha, then publishes with one rename. A rejected name leaves no partial pack.
ZIP ordering, timestamps and metadata are fixed, so the same approved input and
template produce byte-identical contents.

Example for an operator-owned persistent staging directory:

```sh
npm run logos:render -- \
  --city-id 032d98ea-f5da-4826-95bd-c4cf9286716e \
  --city-name Warszawa \
  --slug warszawa \
  --locale pl-PL \
  --output /home/bitcoinwalk/.local/share/bitcoinwalk/city-logos
```

Local short-name, long-name, Polish-diacritic, unsupported-glyph,
deterministic-rerun, safe-filename and cleanup-on-failure gates pass. The legacy
opaque Figma exports remain immutable references; newly generated outputs are
transparent by design, so parity is measured on dimensions, locked brand art
and reviewed text geometry rather than byte equality with those opaque files.
BW-84 was accepted on staging on 3 October 2026. The self-contained renderer is
installed as `bitcoinwalk` at
`/home/bitcoinwalk/.local/lib/bitcoinwalk-city-logo-renderer/city-logo-inkscape-v1`
with the convenience launcher `/home/bitcoinwalk/bin/render-city-logo-pack`.
Generated assets live outside release directories at
`/home/bitcoinwalk/.local/share/bitcoinwalk/city-logos` and are owned by the
non-root account.

The VPS generated the Warszawa pack twice. All twelve published files matched
byte-for-byte, the ZIP contained and CRC-validated all ten PNGs, and the archive
SHA-256 `17494747f4f587ad9aedb28d2b80e3fa426e749de4f1fc3cd4fb2857876d44e4`
matched the independent local clean-room render exactly. One generated PNG and
the manifest were downloaded and independently checked; geometry, spelling and
transparency were correct. The running app remained healthy on release
`app-staging-0.3.129` and was not restarted or modified. Acceptance evidence and
the superseded pre-fontconfig render are recoverable under
`/home/bitcoinwalk/.local/state/bitcoinwalk/backups/city-logo-renderer-final.20261003T084154Z`.
At the BW-84 gate the pack was persistent but not yet approval-triggered or
served by the app. BW-85 below adds the trigger; serving remains BW-86.

## BW-85 durable approval queue — staging acceptance

BW-85 was accepted on staging on 3 October 2026 with app `0.3.131`. The app's
background reconciler reads complete city-revision and decision history through
the existing loopback source relay reader. Only signature-valid decisions from
the pinned super-admin survive that boundary. It joins the exact approved
revision and derives a job key from city ID, revision ID, normalized approved
name, locale and `city-logo-inkscape-v1`; no browser callback can create a job.
Changing the template version produces a new job key rather than silently
reusing an older pack.

The additive `city_logo_runtime` and `city_logo_job` tables live in the existing
app-owned `payments.sqlite`. Invoice and paid-entitlement rows are not queried as
logo authority and were logically identical before and after migration. Jobs
persist state, attempts, next-attempt time, bounded safe error, artifact path and
a five-minute lease token. Expired leases return to the queue; failures retry
with bounded exponential backoff. A single in-process worker prevents concurrent
renders. The worker re-reads verified approval state before and after rendering.
Revocation makes the job obsolete without deleting an artifact; reapproval of
the same exact revision reuses a verified ready artifact.

Historical activation is deliberately narrow: only Warszawa is eligible for the
initial pilot backfill. Any Basic or Pro approval whose signed decision is newer
than the durable activation timestamp is eligible. Broader historical backfill
requires a separate explicit request. The optional signed city locale is used
for casing; retained revisions without it use the locale-neutral `und` fallback.

The live Warszawa approval produced one job, one attempt and state `ready` at
`/home/bitcoinwalk/.local/share/bitcoinwalk/city-logos/.jobs/0972c4e9329f21026127322bbbef228059972a409650e79dab669835c5272560/warszawa`.
Its ZIP digest remained `17494747f4f587ad9aedb28d2b80e3fa426e749de4f1fc3cd4fb2857876d44e4`.
After a required app restart, the complete queue row—including attempt count—was
unchanged, proving restart recovery and duplicate suppression. The app remained
healthy and no signed city decision was changed. Backup and acceptance evidence:
`/home/bitcoinwalk/backups/bw85-logo-queue.uzvkMf`; release evidence:
`/home/bitcoinwalk/backups/app-staging-deploy.WkYLAq`.

## BW-86 durable serving and visibility

App 0.3.132 selects only a `ready` BW-85 job whose city ID, revision ID and
canonical slug equal the current signature-verified approved city. It validates
the complete manifest and every checksum before rendering the page or returning
an artifact. Versioned download routes accept only manifest-listed regular
non-symlink files and set fixed PNG/ZIP/JSON MIME, attachment, `nosniff`, ETag
and immutable cache headers. A stale, failed, corrupt, revoked or superseded job
is not served.

The settled `paid_city_entitlement` row controls discoverability. A ready paid
pack is linked from its public city/event page and organizer city profile. A
ready Basic pack remains available at the canonical direct URL but is absent
from those links and receives `noindex, nofollow` on its page and downloads.
Changing entitlement changes link visibility without regenerating artwork.
Super-admin city moderation receives every durable pack state and attempt count
through the existing signed same-origin payment-status request. The public
release no longer contains the old `/city-logos/...` static bypass.

BW-86 was accepted on staging on 3 October 2026 with app `0.3.132`. The live
Warszawa route returned `noindex, nofollow`, the exact ten PNGs and CRC-valid ZIP
from durable job `0972c4e9…5272560`; manifest and every file checksum passed.
The archive remained
`17494747f4f587ad9aedb28d2b80e3fa426e749de4f1fc3cd4fb2857876d44e4`.
The former `/city-logos/warszawa/...` static URL returned 404. After restarting
the non-root app user service, the manifest was byte-identical and the durable
job key/state/attempt count remained unchanged. Evidence is stored at
`/home/bitcoinwalk/backups/bw86-logo-serving-acceptance.hGN9lb`; pre-deploy and
release backups are `bw86-logo-serving.PzSRXv` and
`app-staging-deploy.no8aoJ`.

## Template 1.2 and approved-city rollout

`city-logo-inkscape-v1.2` removes the one-pixel white stripe inherited from the
historical `bitcoinwalk-on-black` raster. The source evidence is retained
unchanged; exactly 189 source pixels are cleared before the locked artwork is
embedded. A new template identity creates new durable job keys, while v1 and
the superseded v1.1 manifests remain readable during the transition.

The approved-city reconciler now covers every current signature-verified
super-admin approval, including historical cities, for both Basic and Pro tiers.
A newly approved city receives one idempotent logo-pack job without a browser
callback; payment entitlement controls only whether its ready link is listed.

The rollout was accepted on staging on 3 October 2026 with app 0.3.134 and the
non-root renderer installed at `city-logo-inkscape-v1.2`. Barcelona and
Warszawa each rendered once to `ready`; their ten-entry ZIPs passed CRC and
manifest checksum validation, the corrected top-row region was transparent and
each brand-symbol region retained 34,127 bright pixels.
Both cities were free at acceptance, so their direct pages returned 200 with
`noindex` while their public city pages contained no logo link. The complete
job identity, state and attempt counts remained byte-identical across an app
restart. Prior v1/v1.1 jobs and artifacts are retained as `obsolete` evidence.
Pre-activation backup: `city-logo-template-v1.2.vJw0e9`; app/SQLite deployment
evidence: `app-staging-deploy.7xoLcw`.

App 0.3.136 completed the approved-city rollout and made a generated city mark
the accessible `h1` on every published walk page. The former
`BitcoinWalk / published event` eyebrow was removed. Event links created against
an older city revision use the current ready pack for the same immutable city ID
and slug, while revision-specific pack management remains strict. A text heading
is retained only while a verified pack is unavailable.

All nine current approved cities—Augsburg, Bangkok, Barcelona, Cleveland, Köln,
Manchester, Munich, Piaseczno and Warszawa—rendered to `ready` once with no
error. The live Warszawa historical event returned the generated city PNG
inside its `h1`, the old eyebrow was absent,
and the free-tier pack link remained unlisted. All nine job states and attempt
counts remained unchanged across a non-root app restart. Automated acceptance:
112 test files and 544 tests passed; lint reported zero errors and six retained
unrelated image warnings; production build and packaged smoke passed. Release
evidence: `app-staging-deploy.FlEoHG`.

The owner selected the wider `bitcoinwalk-horizontal-on-white` variant for walk
titles after reviewing 0.3.136. App 0.3.137 applies that choice centrally, so it
also becomes the default for future approved-city walk pages; pack generation,
entitlement visibility and stored artifacts are unchanged. Live Warszawa,
Bangkok, Köln and Manchester pages contained the horizontal asset, no vertical
asset and no retired eyebrow. Release evidence: `app-staging-deploy.PkAPRV`.

Pixel-alpha audit found four fully opaque source exports despite their RGBA
format: horizontal BitcoinWalk on white, satsman on white, and both vertical
satsman variants. The other six contain transparent pixels. Preserve these as
reference evidence, not a claim that all outputs are transparent. Resolve the
source background/transparent-export requirement before final generation
acceptance. The page copy no longer claims universal transparency.

The owner approved the Radom, Warszawa and Szydłowiec Figma pilot designs.
Downloads are available to **Basic and Pro cities**, without a login or payment
gate. Publish to staging first at `/<city>/logo`; carry these routes to
`bitcoinwalk.org/<city>/logo` during the separate production launch. Do not change
the current production site or DNS for this work.

Source: https://www.figma.com/design/4Plc48s7zBJXhx2aG9lKHv
Page: City Logo Pilots. Preserve the original source file.

## Prepare a reviewed pack

Export the ten child variant groups for each city, not its enclosing group, as
transparent PNGs at the template's original export sizes. Keep cities in separate
directories. Inspect city spelling, diacritics, clipping and light/dark variants.
Do not substitute screenshots or redraw the logo when export is unavailable.

Run `node scripts/import-city-logos.mjs <slug> <export-directory>` using Node 24+.
The importer accepts the ten known variant filenames, checks PNG dimensions and
alpha, preserves the original bytes, adds city-prefixed names, creates a ZIP and
SHA-256 manifest, and refuses to overwrite an existing pack. Requires `zip`.
Pack contents live in `public/city-logos/<slug>/` and ship with the normal app
release; they contain no credentials or payment data. The ZIP contains the PNGs;
the manifest is a separate download to avoid a circular archive checksum.

The publication inventory in `src/lib/city-logo-packs.ts` binds slugs to immutable
city IDs and names. Add reviewed cities there regardless of tier. A missing pack
returns 404 rather than broken or fabricated download links. This inventory does
not claim city approval, payment or entitlement, and is not a live city registry.

## Acceptance and deployment

Run pack/page tests, the full suite, lint, build, packaged smoke and preview each
real PNG on a contrasting background before non-root staging deployment. Verify
public page, ZIP, individual PNGs and manifest checksums after deployment. Retain
the prior release and a local source backup. Use the standard staging runbook.

Browser-driven Figma export did not produce a download. Manual user PNG handoff
is no longer the proposed solution. BW-83 replaces that dependency with supported
template acquisition. No assets or logo release have been deployed yet. The
hard-coded inventory and release-bundled assets above are prototype limitations
to replace in BW-85/BW-86, not the final approval-driven design.
