# BitcoinWalk web

Start new development with [the compact handover](docs/development-handover.md),
the [maintained backlog](docs/project-backlog.md), and the
[current non-root deployment runbook](docs/app-staging-runbook.md). The
[documentation index](docs/README.md) separates user-facing guidance from
operator and development material.

The BitcoinWalk web client renders verified Nostr city data. Nostr events remain the source of truth;
server-side caching exists only for resilient discovery, page rendering, and link previews.

## Current foundation

- Next.js and TypeScript application shell
- Versioned domain contracts for city data and authorizations
- NIP-52 event payload builder for the next Saturday walk
- Browser-extension signer and verified relay-publication adapters
- Signed organizer submission route, with explicit relay configuration required
- Tests for route-tier and Nostr calendar-event essentials

See [the protocol decisions](docs/protocol-design.md) before changing the event model.

## Local development

Use Node.js 20.9 or newer (the staging deployment uses Node 24). Install the locked dependencies and start the app:

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. Useful routes are `/` (directory), `/start` (new walk), `/organizer` (edit a walk), `/organizer/events` (recurrence drafts), and `/admin` (moderation). The API health check is `/api/healthz`. Organizer and admin actions need a compatible Nostr browser-extension signer and the right account; local development does not provision an identity or grant permissions.

Run `npm test`, `npm run lint`, and `npm run typecheck` for local checks. Typecheck first generates the ignored Next.js declarations required for image and route imports. `npm run build` also generates those declarations before TypeScript and the Next.js production build, writing `.next/`. `npm run release:package` assembles the standalone build and static assets into an ignored, versioned tarball and SHA-256 file under `release-build/`; it does not deploy. `npm run release:smoke` verifies that archive's checksum, extracts it, starts its server locally, and checks health plus a static asset. `npm run start` serves the build. Guide is a separate server-only worker: `npm run guide:build` creates `guide-build/`; see [Guide operations](docs/bitcoinwalk-guide.md) before running it.

The GitHub Actions workflow runs those checks, release packaging, and the archive smoke test after `npm ci` on pull requests and pushes to `main` on the GitHub mirror. ngit remains the primary `origin` remote; commits pushed only to ngit do not trigger GitHub Actions until they are mirrored to GitHub.

## Relay and service configuration

Create `.env.local` in the repository root when you have an appropriate BitcoinWalk relay:

```text
NEXT_PUBLIC_READ_RELAYS=wss://relay-staging.bitcoinwalk.org
NEXT_PUBLIC_WRITE_RELAYS=wss://relay-staging.bitcoinwalk.org
NEXT_PUBLIC_DIRECTORY_RELAYS=wss://directory-staging.bitcoinwalk.org/,wss://directory-2-staging.bitcoinwalk.org/
NEXT_PUBLIC_CALENDAR_DISCOVERY_RELAYS=wss://relay.ditto.pub/,wss://relay.primal.net/,wss://relay.satlantis.io/
```

These values are comma-separated `wss://` relay lists. Staging defaults read and write traffic to `wss://relay-staging.bitcoinwalk.org/`, directory discovery to the two independently hosted BitcoinWalk staging transports shown above, and exact organizer-signed NIP-52 copies to Ditto, Primal and Satlantis for public calendar discovery. New calendar events include a standard nine-character `g` geohash derived from the meeting-point coordinates. Non-blank explicit variables replace the corresponding complete default list; blank variables cannot erase the staging baseline. The directory list must contain two to eight independent root relay URLs before an owner can publish a portable city endpoint root. It is intentionally separate from both application traffic and calendar discovery. `NEXT_PUBLIC_` values are exposed to the browser and baked into production builds. Restart the dev server after changing `.env.local`.

Production builds must override the staging application and directory lists with verified production transports and must reject any built artifact that still contains `relay-staging.bitcoinwalk.org`, `directory-staging.bitcoinwalk.org` or `directory-2-staging.bitcoinwalk.org`. Calendar discovery relays remain a separate explicit list: they receive the unchanged public occurrence or organizer-signed cancellation only after the authoritative BitcoinWalk relay accepts and returns the exact event. Third-party relays are never authoritative application or city-directory sources.

| Optional variable | Purpose |
|---|---|
| `NEXT_PUBLIC_PROFILE_RELAYS` | Public profile lookups; defaults to `wss://relay.damus.io,wss://nos.lol`. |
| `NEXT_PUBLIC_ORGANIZER_INVITE_URL` | Registration URL shown in organizer invitations. |
| `GEOCODE_SEARCH_URL` | Server-side city-search provider; defaults to the Nominatim search endpoint. |

The Guide worker reads `GUIDE_CONFIG` and systemd credential/state directories separately; its [operator guide](docs/bitcoinwalk-guide.md) describes them. Do not put private keys in `.env.local`. If a relay requires NIP-42 authentication, the browser extension receives a separate signing request. Use `/preview/<city>` locally for authenticated preview when public relay reads are unavailable; the public staging proxy blocks `/preview/*`.

See the [delivery backlog](docs/project-backlog.md) for staged features and acceptance still pending. The [Armada relay guide](docs/armada-relays.md) explains App, Community, Search and Direct-message relay configuration for free and paid/private BitcoinWalk cities. The [staging runbook](docs/app-staging-runbook.md) records the audited service layout and operator release/rollback procedure; the [original installation notes](docs/app-staging-deployment.md) are historical.
