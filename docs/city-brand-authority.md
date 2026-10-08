# BW-103 — branded city account authority and privacy

Implemented contract and private request ledger, 7 October 2026. On 8 October,
BW-106 added the strict Khatru admission policy and the application publication
checkpoint. Relay `0.8.88` and app `0.3.195` were deployed to staging on 8
October 2026. BW-105 owns the private setup orchestration; BW-106 still owns
interactive publication acceptance, future city signing and Hosted by replacement.

## Authority resolution

Planned exception: [BW-108 MEP](migrate-existing-paid.md) adopts an already-created paid-city identity. Public host replacement does not require ownership transfer. An explicit transfer making owner and brand the same key requires a reviewed versioned exception across web and relay; the current distinct-key guards remain in force until implemented.

The activation server must assemble fresh `CityBrandAuthority` evidence. The
browser may supply a requested city and brand key, never authoritative owner,
approval, eligibility or entitlement values. Read complete verified current city
approval, creator authorization and the durable settled Pro entitlement. Do not
use requested tier, latest city revision author, editor membership, payer key,
profile name or NIP-05 as ownership evidence. An editor can author a revision
without becoming its owner.

Where a trusted directory root exists, use the current owner from the validated
anchored successor chain, requiring configured transports to agree. Otherwise
use the creator from the super-admin-signed authorization record, after proving
that no anchored directory applies. An unavailable or conflicting directory
cannot trigger creator fallback. Bind the request to the exact authority event,
approval event and private entitlement ID. Resolve eligibility from approval,
settlement and current account/city restrictions; archive or disapproval prevents
new activation/replacement. Revocation must remain possible when eligibility is
lost. Recheck this evidence immediately before approval, publication and actual
activation. Never rotate directory ownership as a side effect of branding.

## Signed request and review

`createCityBrandChallenge` creates a 15-minute request with a random UUID supplied
by the private store, canonical HTTPS origin, current authority evidence and exact
proposed binding. `cityBrandProofTemplate` prepares separate owner and brand
proofs. These use the project's private kind-27235 signed-command convention,
not a claim of standard NIP-98 wire compatibility. Exact tags bind the origin,
purpose and role; both signatures bind the request ID, timestamps, city,
predecessor, brand key and authority snapshot. These events must never be sent
to public relays. They contain personal ownership and entitlement evidence.

Activation requires a distinct brand key plus both proofs. Replacement requires
the current owner's authorization and the new brand's proof; the old brand key
is not required, allowing recovery after its loss. Revocation requires the
current owner, followed by super-admin review, but no brand signature. The
super-admin cannot stand in for a missing owner proof in this flow. If the owner
key is also lost, first complete existing directory/ownership recovery and then
prepare a fresh brand request. No implicit recovery power is added.

`authorizeCityBrand` checks fresh evidence, signatures and the exact predecessor
and emits a minimal approval template. It copies no private proof fields into
that template. The super-admin signs the exact template; the private ledger
validates it again within an immediate SQLite transaction before recording one
successor. One pending request per city prevents overlapping setup; expiry or
owner cancellation permits a new request. Exact successful retries return the
same current event and create no new binding. Superseded events cannot be revived.

## Public record and relay admission contract

Application kind **30312** is reserved in the web contract after checking the
current local web/relay kind inventory. Reconfirm allocation before enabling it
in Khatru. Each super-admin-signed event contains only:

```json
{"version":1,"cityId":"<uuid>","sequence":0,"previous":"","action":"activate","brandPubkey":"<hex>"}
```

Tags are exactly `d=<cityId>:<sequence>`, `i=<cityId>` and
`t=bitcoinwalk-city-brand-v1`. No owner signature, owner npub, payout destination,
request ID, entitlement ID or hash of private evidence is included. Full history
is retained through unique sequence addresses. This is a BitcoinWalk-specific
attestation, not a new general Nostr ownership standard.

The relay now independently checks exact schema and tags, the designated
super-admin signature, city existence, current approval and suspension policy
for activate/replace, sequence zero plus empty predecessor only for activation,
and exactly the retained latest predecessor plus next sequence for replacement
or revocation. Its locked write path enforces monotonic time and one successor;
identical retries are idempotent and competing successors fail. Revoke keeps the
prior brand key and cannot revoke twice. Replacement uses a different key,
including after revocation. Revoked history is retained. Private proof commands
are never admitted as public brand records. Public readers trust the super-admin
attestation, not private owner evidence unavailable to them.

`resolveCityBrand` validates a complete history and rejects missing predecessors,
forks, foreign-city records and malformed signatures. A revoked result is not an
active account. Relays and read clients must establish a complete current view;
absence in a truncated read or stale cache is not proof of no binding. Seed the
private ledger from verified authoritative history before accepting requests on
an existing city or recovering a database. Private approval alone is not public
activation. The super-admin review keeps an approved request in a distinct
private state. A separate action repeats fresh authority/setup checks, publishes
the already-signed event unchanged, reads bounded history independently from
every configured write relay, repeats the checks again, and only then records
the binding as active. Missing or mismatched read-back leaves it approved and
safe to retry; it does not create another signature or identity.

## Privacy and permission boundaries

The only public store projection is the approved event history. Private proofs
remain in the app-owned protected SQLite ledger and its encrypted backups. The
feature-gated Pro setup endpoint instantiates this store inside the protected
payment database. Its owner and super-admin actions use signed, origin-bound
commands, fresh verified evidence, bounded input and scoped projections. Private
rows and proofs are never serialized into public page data.

The BW-106 public display slice is implemented locally on 8 October 2026.
`resolvePublicCityHost` reads bounded, complete retained kind-30312 history from
each configured authoritative server read relay, verifies signatures and the
full successor chain, and requires matching heads. It shares one presentation
between dated event routes and city pages without an upcoming event. Aliases and
city routes redirecting to event pages inherit the same resolver. No private
ledger, owner proof, payout destination or browser-supplied binding is read.

An active city binding replaces the person's Hosted by card, including the
profile link and copyable npub. Only that key's signed public profile is loaded;
the fallback is the city name and neutral avatar, never the personal profile.
Profile NIP-05 retains the shared component's independent verification states.
Branded Lightning fields/actions remain suppressed until separate verified
provisioning is wired in under BW-19/BW-107: a profile's lud16 alone is not proof
of the correct 79/21 route. Existing unbranded event host behavior is preserved.
For an unbranded city without an upcoming event, the signed creator grant is used,
not the author of its latest (possibly editor-authored) revision.

Failures, truncated history, conflicting replicas and revoked bindings show
identity unavailable, with no personal fallback or payment link. The public
delegated-person panel is likewise omitted for branded/unverified identities;
CMS delegation and signed history are unchanged. Historical event objects and
nevents are never rewritten. No cross-request identity cache is introduced.
Read scopes are one bounded city filter per configured authoritative relay.
Staging deployment and real binding/profile visual acceptance remain pending;
this implementation does not activate London's identity or transfer ownership.

Local verification: 847 tests across 166 files pass with `--maxWorkers=4`,
TypeScript and the production build pass, and backlog generation/diff checks
pass. The unrestricted repeat hit the existing artwork test's five-second
timeout (846 other tests passed); limiting test concurrency passed the complete
suite without changing timeouts or artwork code. Full lint has zero errors and
four existing image-element warnings in unrelated components; changed-file lint
passes. New fixtures cover signed activation/replacement/revocation, malformed
signatures, foreign cities, gaps/forks, replica disagreement, capped/failed
reads, no-event cities, payment suppression and exact historical event/nevent
preservation through the rendered walk page. No real binding was published.

Personal dashboard login and payout data remain restricted to authorized views.
Existing public creator/editor records, anchored owner chains, event authors and
historical zap receipts can link identities; presentation privacy cannot remove
that history. Branding grants no editor, directory-owner, payout-management or
spending authority. Future city-event publishing requires a separate explicit
relay permission and the city signer; historical event signatures remain intact.

## Verification and delivery boundaries

Signed fixtures exercise owner/brand/admin separation, changed ownership,
approval and entitlement, foreign cities, role swapping, expiry, replay, modified
cached signatures, strict public schemas, private-data exclusion, atomic failed
approval, restart retries, replacement, lost-brand-key revocation and history
fork/gap rejection. BW-103 supplies these executable rules and the integration
contract. BW-105/BW-106 must test fresh evidence resolution, live relay admission,
outage recovery and publication before any account becomes active. BW-102 remains
the end-to-end branded-profile and payment pilot.
