# BitcoinWalk protocol design

## Confirmed product decisions

- A free city uses `bitcoinwalk.org/<city>` and the shared BitcoinWalk relay. The URL name is derived from the city name and resolved on approval; organizers never enter it.
- A paid city uses `<city>.bitcoinwalk.org`, receives a city relay, NIP-05 identity, and a LNURL split.
- Organizers use an existing Nostr identity or create one; private keys are never stored by the web app.
- Browser extension signing is first. Remote signer support follows.
- The BitcoinWalk super-admin is always an authorized city editor.
- Hero images are stored on the BitcoinWalk VPS after their source is selected online.
- The optional upgrade is 21,000 sats. City LNURL income splits 79% to the organizer destination and 21% to BitcoinWalk.
- Each city begins with one editable sponsor slot managed by the organizer, with an organization override.

## Data sources

Signed Nostr events are canonical. The web service keeps a materialized, invalidatable read model to make
discovery, server-rendering, and Open Graph generation reliable. It never becomes the only way to create
or verify a city record.

## Event classes

| Purpose | Proposed representation |
| --- | --- |
| City identity | Immutable city root, with a UUID and city slug |
| City content | Versioned city document signed by an authorized editor |
| Editor authorization | Super-admin-signed authorization record listing editor pubkeys |
| Approval | Super-admin-signed approval/revocation record referencing the city root and content revision |
| Upcoming walk | NIP-52 kind 31923 time-based calendar event |

The application publishes a dated NIP-52 event for the organizer-selected date and time. A recurring-walk
feature can later create individual dated events; NIP-52 intentionally has no recurrence model.

Public rendering accepts approval records only when their signer is the configured BitcoinWalk super-admin
key. A valid signature from an arbitrary Nostr identity is not sufficient.

The admin queue lists pending signed city revisions. Approving or rejecting creates a separate, signed Nostr
decision event; it never changes the organizer's original event.

## Remaining implementation decision: canonical city signer

An addressable Nostr event only replaces an event from the same pubkey. Multiple authorized editors cannot
all overwrite a single organizer-authored address without a resolver rule. Before implementing publication,
choose one of these:

1. **Managed city signer (recommended):** each city has a stable city key held by a remote signer. Signed
   editor requests are authorized by the relay/app and result in a canonical city event. External apps see
   one consistent city identity.
2. **Multi-author resolver:** every authorized editor publishes its own revision. BitcoinWalk resolves the
   latest valid revision, but third-party clients can see competing records.

No user `nsec` is stored in either option.

## Relay topology

- A Khatru-based shared relay carries all free-city events.
- Paid cities get `wss://<city>.bitcoinwalk.org`; events are also copied to the shared relay and selected
  public discovery relays.
- Publishing requires acknowledgement from the city/shared relay plus one public relay where configured.
- Read clients validate signatures, authorization, approval state, and the selected content revision.

## Public URLs

- `bitcoinwalk.org/<city>` is the free-city page.
- `<city>.bitcoinwalk.org` is the paid-city page.
- `/nevent` resolves the next dated event for a human-friendly stable URL.
- `nevent1…` and `naddr1…` are emitted for Nostr clients and portable sharing.

## Payment and identity provisioning

After a Rustress invoice settles, the provisioning worker:

1. creates/activates the NIP-05 name mapping;
2. configures the LNURL endpoint and 79/21 split;
3. provisions the paid hostname and relay;
4. publishes the payment identity and relay hints to the city metadata.

Payment processing is idempotent and separately auditable from Nostr content editing.
