# BW-101 — organizer payout setup

## Implemented foundation — 7 October 2026

The feature-gated Pro setup preview now includes one reusable **Lightning address or LNURL-pay** field. The current verified city owner signs the exact city and requested destination. Saving validates the endpoint and writes a new private destination version; it does not issue an invoice, make a test payment, configure Rustress or activate city Lightning payments.

Lightning addresses are normalized to an HTTPS `/.well-known/lnurlp/<name>` endpoint. Raw `lnurl1…` values require a valid Bech32 checksum and decode to public HTTPS. Validation pins the request to a publicly resolved IP, keeps the original TLS server name and Host, limits time and response bytes, disallows redirects and credentials, and requires LNURL-pay JSON with a safe callback, integer millisatoshi range and parseable metadata. Private/reserved networks and configured BitcoinWalk/managed domains are rejected to prevent SSRF and split cycles. Validation never requests an invoice or sends funds.

The SQLite history lives in the existing protected app payment database. Each row retains the exact owner-signed command and the fresh authority snapshot privately, while the owner-facing projection returns only city, version, normalized destination, range and confirmation time. Exact signed retries are idempotent; a later confirmation creates a new immutable version. The store independently verifies signature, current-owner identity, city and semantically normalized destination. Editors, donors, prior owners and ineligible/suspended cities fail before storage. Authority and entitlement are resolved again after remote validation to close ownership-change races.

The UI explains the 79/21 terms before signing. It shows the current version to the signed-in owner and states that existing invoices retain their previous version. A saved destination remains `saved-not-active`: city Lightning invoice issuance stays disabled until BW-18/BW-19 provisioning and read-back succeed.

## Configuration and operation

The screen/API remain default-off behind `BITCOINWALK_PRO_SETUP_PREVIEW=true`. `BITCOINWALK_PAYOUT_BLOCKED_DOMAINS` may add comma-separated domains; `bitcoinwalk.org` and subdomains are always blocked as personal destinations. Persistent storage uses the already configured `BITCOINWALK_PAYMENT_DATABASE`; no NWC permission or new secret is added. Keep the database in encrypted backups because it contains personal payout destinations and signed ownership evidence.

This slice has process-local request throttling. Production must also retain proxy/ingress limits. Endpoint validation is point-in-time evidence and must be repeated before provisioning and whenever a destination is reconfirmed. DNS, callback or amount changes after confirmation must put setup into needs-attention rather than silently redirecting funds.

## Remaining before BW-101 is Done

- Connect the same field to registration Step 3 **before** self-purchase invoice creation, and to existing Basic-city upgrades. A missing/invalid destination must block organizer checkout; gift checkout must never request one.
- Persist a durable setup task keyed by city and entitlement, including gift fixtures, missed Guide DMs, cross-device resume and provisioning failure without repurchase.
- Revalidate current versions before Rustress apply/read-back and bind every incoming city invoice to an immutable destination version.
- Add an authorized destination-change status/audit notification and explicit super-admin recovery path. Never expose the destination publicly.
- Accept real public endpoints and owner/editor/former-owner/restart flows in staging, then repeat the full gift journey under BW-99.

Automated coverage includes checksum and normalization, malformed/cyclic/unsafe endpoints, amount/metadata checks, signed-command tampering, immutable history, exact retries, private projection, ownership rotation/outage/suspension/unpaid denial and safe API errors. Live endpoint and Rustress acceptance remain outstanding.
