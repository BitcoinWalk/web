# BW-103 — branded city account authority and privacy

Implemented contract and private request ledger, 7 October 2026. This foundation
is not wired into production routes, relay admission or public profile rendering.
BW-105 owns activation orchestration; BW-106 owns relay integration, future city
signing and Hosted by replacement. No deployment is needed for this isolated
library until those consumers exist.

## Authority resolution

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

Before activating BW-106, implement these independent relay checks: exact schema
and tags, valid designated super-admin signature, city existence, current policy
eligibility for activate/replace, sequence zero plus empty predecessor only for
activation, and exactly the retained latest predecessor plus next sequence for
replacement/revocation. Enforce monotonic time and one accepted successor under
concurrency; identical retries are idempotent and competing successors fail.
Revoke keeps the prior brand key and cannot revoke twice. Replacement uses a
different key, including after revocation. Retain revoked history. Private proof
commands are never admitted as public brand records. Public readers trust the
super-admin attestation, not private owner evidence unavailable to them.

`resolveCityBrand` validates a complete history and rejects missing predecessors,
forks, foreign-city records and malformed signatures. A revoked result is not an
active account. Relays and read clients must establish a complete current view;
absence in a truncated read or stale cache is not proof of no binding. Seed the
private ledger from verified authoritative history before accepting requests on
an existing city or recovering a database. Private approval alone is not public
activation: publish, exact read-back and current eligibility are subsequent gates.

## Privacy and permission boundaries

The only public store projection is the approved event history. Private proofs
remain in the app-owned protected SQLite ledger and its encrypted backups. No
HTTP endpoint or default runtime instantiates this store yet. Future API callers
must use authenticated actor identity, fresh verified evidence, bounded input
and scoped access; do not serialize private rows into public page data.

The public branded identity replaces the person's Hosted by card after BW-106.
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
