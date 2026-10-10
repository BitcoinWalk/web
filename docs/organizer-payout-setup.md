# BW-101 — organizer payout setup

## Implemented foundation — 7 October 2026

The feature-gated Pro setup preview now includes one reusable **Lightning address or LNURL-pay** field. The current verified city owner signs the exact city and requested destination. Saving validates the endpoint and writes a new private destination version; it does not issue an invoice, make a test payment, configure Rustress or activate city Lightning payments. The same field is now present under Pro registration Step 3 and must be completed before continuing to checkout.

Lightning addresses are normalized to an HTTPS `/.well-known/lnurlp/<name>` endpoint. Raw `lnurl1…` values require a valid Bech32 checksum and decode to public HTTPS. Validation pins the request to a publicly resolved IP, keeps the original TLS server name and Host, limits time and response bytes, disallows redirects and credentials, and requires LNURL-pay JSON with a safe callback, integer millisatoshi range and parseable metadata. Private/reserved networks and configured BitcoinWalk/managed domains are rejected to prevent SSRF and split cycles. Validation never requests an invoice or sends funds.

The SQLite history lives in the existing protected app payment database. Each post-payment row retains the exact owner-signed command and fresh authority snapshot privately, while the owner-facing projection returns only city, version, normalized destination, range and confirmation time. Registration uses a separate private prepayment version bound to the exact owner-signed city revision. Exact signed retries are idempotent. The server verifies the published Pro revision/creator, validates the endpoint, rechecks the revision, saves the prepayment version and atomically binds any newly created 21,000-sat invoice to that version. Retrying or changing the field cannot rewrite an already-open invoice. A successful purchase retains the destination as a confirmation suggestion; it is not silently promoted to an active payout.

The UI explains the 79/21 terms before signing. It shows the current version to the signed-in owner and states that existing invoices retain their previous version. A saved destination remains `saved-not-active`: city Lightning invoice issuance stays disabled until BW-18/BW-19 provisioning and read-back succeed.

Settlement and recovery are now durable. The entitlement and exactly one city setup task are written atomically, including the prepayment destination-version reference. Opening setup on another device reconstructs missing legacy tasks from verified entitlement data and shows the checkout value only as a private suggestion to the same current owner for the exact purchased revision. The current owner must sign it again before it becomes the post-payment version. A directory ownership rotation clears prior-owner confirmation, and conflicting entitlement or payout bindings fail closed for operator review.

## Configuration and operation

The screen/API remain default-off behind `BITCOINWALK_PRO_SETUP_PREVIEW=true`. `BITCOINWALK_PAYOUT_BLOCKED_DOMAINS` may add comma-separated domains; `bitcoinwalk.org` and subdomains are always blocked as personal destinations. Persistent storage uses the already configured `BITCOINWALK_PAYMENT_DATABASE`; no NWC permission or new secret is added. Keep the database in encrypted backups because it contains personal payout destinations and signed ownership evidence.

This slice has process-local request throttling. Production must also retain proxy/ingress limits. Endpoint validation is point-in-time evidence and must be repeated before provisioning and whenever a destination is reconfirmed. DNS, callback or amount changes after confirmation must put setup into needs-attention rather than silently redirecting funds.

## Post-activation changes — implemented 10 October 2026

An active Pro city can now save a fresh owner-signed destination without disrupting its existing route. A durable payout-update outbox binds the exact old provider configuration, new immutable payout version, fresh city authority and validated endpoint. Rustress registers the new payout authority through its separately authenticated loopback channel before applying the compare-and-swap provider version. The app keeps the old activation row public until the new provider configuration, NIP-05 and LNURL endpoints have all been independently read back; only then does one local transaction promote the new version. Existing invoices retain their original payout authority.

Unknown write outcomes are reconciled by exact provider status before retry, so a lost response cannot repeat or blindly replace a change. Changed ownership, binding, signer, slug, split, wallet or destination evidence blocks the transition. A second change cannot overtake unfinished work. The owner-facing screen distinguishes active, pending and needs-attention versions without exposing the destination publicly. BitcoinWalk Guide queues content-free saved, active and needs-attention messages keyed by city, payout version and state.

## Remaining before BW-101 is Done

- Deploy the managed Rustress `0.1.4` adapter and app `0.3.246` to staging using the non-root service account. The adapter must receive the existing payout service's authority token by protected file; no credential is copied into the app.
- Re-save an already active staging city's existing external destination as a harmless new immutable version. Confirm the old version stays live until promotion, restart both workers during reconciliation, verify the new public endpoint and receive all Guide state messages.
- Confirm a newly issued small invoice binds the promoted version while an invoice issued before the change retains the old version. No payout destination is changed for this acceptance.
- Exercise the super-admin retry view for a deliberately paused update. Editors, gift payers and former owners must remain unable to create or resume it.

Automated coverage includes checksum and normalization, malformed/cyclic/unsafe endpoints, amount/metadata checks, signed-command tampering, immutable history, exact retries, private projection, prepayment revision/version and invoice binding, atomic settlement/task creation, cross-device recovery, ownership rotation/outage/suspension/unpaid denial, compare-and-swap payout updates, lost-response recovery, old-version preservation, public read-back gating, Guide transitions, conflict rollback and safe API errors. Live staging update acceptance remains outstanding.
