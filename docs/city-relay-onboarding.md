# City directory and organizer-owned relay onboarding

Reviewed 7 October 2026. This is the implementation plan for BW-94–BW-98, not an assertion that these features are deployed.

## First delivery: London

London's dedicated receiver has passed exact 8/8 replication acceptance. It needs its own city-scoped directory root; adding London to the Memphis chain would be invalid. The existing directory transport is scoped to a single city, so multi-city admission and storage come first (BW-94).

The super-admin prepares a request in `/admin` using the approved city identity and verified endpoint. London uses `wss://london.bitcoinwalk.org/` as primary, no mirror initially, and the super-admin as an endpoint-only operator. Guide sends the owner instructions and a CMS link. The organizer signs in, supplies a separate offline recovery npub, reviews all authorities and endpoints, and signs the exact root with their own signer (BW-95).

The organizer receives only the city permissions they already hold. The invitation is expiring and owner-bound; opening it must not consume it, since message clients may preview links. Expired invitations can be reissued against the same request. Never put signing secrets in URLs. Signing checks current owner/chain state again, and any change requires a new review. Directory ownership after establishment comes from the verified chain, including rotation/recovery, rather than assuming the original organizer always remains owner.

After signature validation, the super-admin activates the bundle (BW-96). Root trust must be established from the approved owner and exact signed event before either transport admits it. Installing the anchor and submitting the event are separate, recoverable steps. Retry only the same signed event after partial success; conflicting state blocks activation. A web request must not obtain unrestricted shell or infrastructure credentials: a constrained worker executes validated jobs and records durable evidence. Infrastructure upgrades are deployment prerequisites, not arbitrary commands triggered by an organizer's signature.

Request states: draft → awaiting owner → signed → activating → active, with expired, rejected, superseded and retryable failure outcomes. Show signing, anchoring, each transport's read-back and operational replication as separate statuses. A published directory entry does not itself provision a relay or enable delivery. Activation acceptance includes restart persistence; routine health checks do not restart services.

The staging discovery hosts remain explicitly staging. Production discovery domains, TLS, client configuration and trust-bundle rollout must be reviewed before production onboarding is considered complete. This is distinct from London's production city-relay hostname.

## Organizer-owned relay delivery

BW-97 adds a City relay panel with managed/external choice, endpoint, compatibility result and control-verification instructions. A publicly writable Nostr challenge proves publication access, not relay administration. Require a nonce bound to the city, organizer, endpoint, request and expiry, installed through relay configuration or an HTTPS well-known resource on the endpoint host. Verify it server-side; do not accept an unrelated domain or treat NIP-11 metadata alone as proof. This proves endpoint administration, not ownership of the city.

Compatibility requires more than NIP-01/NIP-11. Current BitcoinWalk delivery uses authenticated envelopes and city authority, cancellation, revocation and moderation policy. A generic relay needs a supported adapter or compatible receiver before it qualifies. Document supported versions and return clear remediation instructions. Define a separate standard-event export feature later if desired; it must not be presented as a fully compatible city replica.

All server probes must restrict destinations to public addresses, revalidate DNS at connection time, reject private/link-local targets and unsafe redirects, bound response sizes/timeouts, and rate-limit requests. Use controlled policy fixtures on an isolated test instance or explicitly authorized candidate; arbitrary production relay probes must not leave test events behind.

BW-98 defaults to a public mirror. The organizer configures the expected BitcoinWalk delivery public identity and city policy locally; private signing credentials remain with the sending service. Changes to credentials are scoped, revocable and audited. Hosting externally does not independently grant a paid entitlement or official recognition; use the existing verified eligibility rules and expose ineligibility clearly.

Seed the visible authorized state and its required provenance, excluding hidden history and private wrappers. Verify exact event IDs/signatures and semantic suppression behaviour rather than raw database bytes. Support legitimately empty approved cities with explicit empty-state acceptance. Keep ongoing delivery/reconciliation active so the candidate cannot become stale between seed and directory signing. Owner-assisted restart evidence is required where BitcoinWalk has no host access; do not request unrestricted SSH access.

Once accepted, reuse the owner/operator signing and activation path. Prefer owner review; an existing delegated operator may change only the fields authorized by the current chain. New roots always require the owner. Monitor connectivity, last successful delivery, exact-state audit freshness and failures through BW-81, with deduplicated Guide transitions. A reachable relay with stale or unaudited data must not appear healthy.

## Scope and acceptance order

1. BW-94: isolated two-city tests, conflict/cross-city rejection, durable restart and partial-outage evidence.
2. BW-95: owner, editor and super-admin permission boundaries; extension and remote signing; stale request, rotation, expiry and exact retry checks.
3. BW-96: London pilot from Guide invitation through signature, constrained activation and two-transport read-back; duplicate delivery and interrupted activation recovery.
4. BW-97: prove control on a compatible external candidate; reject open-publication-only proof and incompatible policy implementations.
5. BW-98: seed, continuous catch-up, restart/outage, moderation and directory mirror activation acceptance.

BW-61 continues to own switching the primary, retaining the old endpoint through soak, rollback and separately confirmed retirement. Its existing Memphis work remains paused until resumed explicitly. BW-20 owns automatic managed provisioning. BW-29 and BW-62 retain transfer and Umbrel/Start9 packaging. Private chat migration, independent publishing during BitcoinWalk outages, Lightning credentials and organizer key custody are outside this delivery.
