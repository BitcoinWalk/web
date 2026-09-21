# BitcoinWalk web

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

Run `npm test`, `npm run lint`, and `npm run typecheck` for local checks. Typecheck first generates the ignored Next.js declarations required for image and route imports. `npm run build` also generates those declarations before TypeScript and the Next.js production build, writing `.next/`. `npm run start` serves that build. Guide is a separate server-only worker: `npm run guide:build` creates `guide-build/`; see [Guide operations](docs/bitcoinwalk-guide.md) before running it.

The GitHub Actions workflow runs those checks after `npm ci` on pull requests and pushes to `main` on the GitHub mirror. ngit remains the primary `origin` remote; commits pushed only to ngit do not trigger GitHub Actions until they are mirrored to GitHub.

## Relay and service configuration

Create `.env.local` in the repository root when you have an appropriate BitcoinWalk relay:

```text
NEXT_PUBLIC_READ_RELAYS=wss://relay-staging.bitcoinwalk.org
NEXT_PUBLIC_WRITE_RELAYS=wss://relay-staging.bitcoinwalk.org
```

Both values are comma-separated `wss://` relay lists. They have no default; relay-backed pages and submissions need explicit configuration. `NEXT_PUBLIC_` values are exposed to the browser and baked into production builds. Restart the dev server after changing `.env.local`.

| Optional variable | Purpose |
|---|---|
| `NEXT_PUBLIC_PROFILE_RELAYS` | Public profile lookups; defaults to `wss://relay.damus.io,wss://nos.lol`. |
| `NEXT_PUBLIC_ORGANIZER_INVITE_URL` | Registration URL shown in organizer invitations. |
| `GEOCODE_SEARCH_URL` | Server-side city-search provider; defaults to the Nominatim search endpoint. |

The Guide worker reads `GUIDE_CONFIG` and systemd credential/state directories separately; its [operator guide](docs/bitcoinwalk-guide.md) describes them. Do not put private keys in `.env.local`. If a relay requires NIP-42 authentication, the browser extension receives a separate signing request. Use `/preview/<city>` for authenticated preview when public relay reads are unavailable.

See the [delivery backlog](docs/project-backlog.md) for staged features and acceptance still pending. Staging deployment notes are historical context, not a local installation command.
