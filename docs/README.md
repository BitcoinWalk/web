# BitcoinWalk documentation

This directory contains the maintained product, protocol and operations
documentation for BitcoinWalk. Public user guidance and private operational
runbooks have different publication requirements: inclusion in this repository
does not automatically make an operator document part of the future public
knowledge base.

## User and organizer guidance

- [Configure Armada relays for BitcoinWalk](armada-relays.md) — App,
  Community, Search and Direct-message relay settings for Basic/free and
  Pro/paid cities, including private city communities and Guide DMs.
- [City chat integration](chat-integration.md)
- [Paid-city community provisioning](paid-city-communities.md)
- [Organizer staging guide](organizer-staging.md)
- [Organizer events](organizer-events.md)
- [Co-organizers](co-organizers.md)
- [Organizer invitations](organizer-invitations.md)
- [City logo packs](city-logo-packs.md)

The public knowledge-base source lives in `documentation/`. Its explicit
`public-content.json` allowlist and build-time disclosure checks prevent private
operations material from entering the generated site. Repository documents
remain implementation evidence unless separately reviewed and rewritten into
that public corpus.

## Product and protocol

- [Protocol design](protocol-design.md)
- [Project backlog](project-backlog.md)
- [Public directory](public-directory.md)
- [City payments](city-payments.md)
- [Relay replication](relay-replication.md)
- [Sponsorships](sponsorships.md)

## Development and operations

- [Development handover](development-handover.md)
- [Staging deployment](app-staging-deployment.md)
- [Staging runbook](app-staging-runbook.md)
- [Production migration](production-migration.md)
- [Production free relay](production-free-relay.md)
- [Remote signing transport](remote-signing.md)

Operational documents may contain internal topology and recovery detail. Do
not publish them to `docs.bitcoinwalk.org` merely because they are linked here;
BW-68 requires an explicit public allowlist and proof that excluded material is
absent.
