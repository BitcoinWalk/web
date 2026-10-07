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

## Remaining before BW-101 is Done

- Connect the same field to existing Basic-city upgrades. Registration Step 3 and new invoice binding are implemented. Gift checkout must never request a payout destination.
- Add the Basic upgrade and gift entry points, then queue a deduplicated Guide setup notification. The durable city/entitlement task and cross-device resume are implemented; a missed DM is no longer the only recovery route.
- Revalidate current versions before Rustress apply/read-back and bind every incoming city invoice to an immutable destination version.
- Add an authorized destination-change status/audit notification and explicit super-admin recovery path. Never expose the destination publicly.
- Accept real public endpoints and owner/editor/former-owner/restart flows in staging, then repeat the full gift journey under BW-99.

Automated coverage includes checksum and normalization, malformed/cyclic/unsafe endpoints, amount/metadata checks, signed-command tampering, immutable history, exact retries, private projection, prepayment revision/version and invoice binding, atomic settlement/task creation, cross-device recovery, ownership rotation/outage/suspension/unpaid denial, conflict rollback and safe API errors. Live endpoint, Guide and Rustress acceptance remain outstanding.
