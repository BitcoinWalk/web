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

The visual interface is intentionally minimal. Product UI/UX will be implemented separately from protocol
and application logic.

See [the protocol decisions](docs/protocol-design.md) before changing the event model.

## Local relay configuration

Create `.env.local` when the BitcoinWalk Khatru relay is available:

```text
NEXT_PUBLIC_READ_RELAYS=wss://relay.bitcoinwalk.org
NEXT_PUBLIC_WRITE_RELAYS=wss://relay.bitcoinwalk.org
```

The app does not default to public relays; submissions stay local until a BitcoinWalk relay is deliberately configured.
If the relay requires NIP-42 authentication, the organizer's browser extension receives a separate signing request.
The admin queue also uses the super-admin browser signer when a relay restricts reads with NIP-42.
While a relay is private, use `/preview/<city>` to load an approved city page through a browser signer.
