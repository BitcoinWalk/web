# Rustress city identity and Lightning provisioning

Implementation plan agreed in scope on 7 October 2026. Planning only: no wallet permissions, payments, city mappings or services are changed by this document.

## Product behavior

When an organizer selects Pro in registration Step 3, require **Your Lightning address or LNURL** before checkout. Accept a Lightning address such as `organizer@example.com` or a valid LNURL-pay `lnurl1…` value. Explain: “79% of payments to your city’s BitcoinWalk Lightning address goes to this destination. BitcoinWalk retains 21%.” Validate and confirm the destination before showing the existing 21,000-sat invoice. Basic registration has no required payout field.

After verified Pro settlement and signed city approval, provision the canonical address, for example `london@bitcoinwalk.org`, in Rustress for both NIP-05 and LNURL-pay. Configure one Prism recipient at 79%; the remaining 21% stays in the BitcoinWalk receiving wallet. A settled 100-sat payment creates a 79-sat organizer obligation and 21-sat BitcoinWalk allocation. The one-time 21,000-sat Pro purchase is separate and does not enter this split.

NIP-05 maps the city address to the approved city Nostr identity. Resolve this identity explicitly from current approved records and anchored ownership evidence where available; do not assume any connected editor or payment funder owns it. If no unambiguous city identity exists, require a super-admin reviewed assignment with proof from that identity. A Lightning payout destination need not belong to the same Nostr identity. Publishing `nip05`/`lud16` in that identity’s Nostr profile requires the identity’s own signature and preserves unrelated profile fields.

## Verified upstream baseline

Reviewed [Rustress source](https://github.com/frnandu/rustress/tree/c72fdeccd80025d181efc1b1d45baeb8bfbde4a9), commit `c72fdeccd80025d181efc1b1d45baeb8bfbde4a9`, on 7 October 2026. Before implementation compare this with the installed instance and pin the tested release.

- Rustress implements NIP-05, LNURL-pay, NIP-57 receipts and Prism splitting. Its documented partial-percentage split retains the remainder in the wallet.
- Prisms require NWC `pay_invoice`; receiving invoices alone is insufficient. Preserve BW-17’s existing `make_invoice`/`lookup_invoice` connection. Supply Rustress with a separate, revocable connection for invoice creation, settlement lookup, outgoing payment reconciliation and received-payment notifications, with the minimum supported methods established against the actual Alby Hub version.
- `process_prism_payment` currently resolves `user@domain` recipients only, calculates using floating point and skips splits below 1,000 msats. Supporting raw LNURL-pay is implementation work.
- Settlement is claimed before forwarding. Per-recipient failures are logged; the reviewed database has no durable payout-obligation/retry table. A restart or uncertain payment must not lose the organizer’s share or produce a second payout.
- The forwarding path needs explicit remote-endpoint protection, recipient invoice amount/network/expiry/metadata validation, fee limits, and removal of payment preimages and sensitive response logging.
- Admin routes provide browser-session management. Do not assume a stable, restricted machine provisioning API exists. Add a narrow authenticated server-to-server adapter/API in Rustress, with transactionally applied configuration and read-back, instead of automating its dashboard or writing directly to its database.

## Stage 1 — Rustress integration and wallet boundary (BW-100)

Inventory the existing Rustress instance, version, domains and NWC capabilities without printing credentials. Prepare a pinned deployment or maintained patch set for the integration and payout requirements below. Use the existing non-root VPS deployment account and a service identity with protected persistent storage. Keep Rustress administration private and route only required public NIP-05/LNURL endpoints through the apex reverse proxy; BitcoinWalk’s `/admin` continues to serve the CMS.

Create a separate Rustress NWC connection, with a limited budget and preferably a dedicated wallet/sub-wallet funded for incoming payments and routing fees. Confirm supported permissions and notification behavior before enabling spending. Keep credentials server-side in protected storage, exclude them from API responses/logs and encrypt backups containing Rustress’s credential-bearing database. Define revocation, rotation and recovery. A paused or budget-exhausted wallet leaves an outstanding obligation visible.

Deliver a restricted, authenticated provisioning interface keyed by city ID and configuration version: prepare, apply, read status, update destination and disable new invoice issuance. Enforce unique domain/local-part claims, idempotent retries and atomic user-plus-split changes. Reconcile only BitcoinWalk-managed entries; do not overwrite unrelated users in the existing Rustress instance.

## Stage 2 — organizer payout onboarding (BW-101)

Use one reusable destination input for Pro registration, existing Pro-city setup, owner edits and future BW-99 upgrades. Normalize Lightning addresses and decode LNURL-pay. Validate public HTTPS endpoints and callbacks with bounded responses/timeouts, redirect and DNS-rebinding protection, LNURL-pay type and supported amount range. Reject self-referential city addresses and known managed split cycles. Never request the organizer’s NWC connection or private key.

Save a creator-signed, city-scoped destination version through an authenticated API, using private provisioning storage unless a separately reviewed public schema is required. Bind the checkout to the validated version. A later successful payment must remain recoverable even if validation or provisioning subsequently fails. Existing paid cities without a destination show **Setup required** and never receive another Pro purchase invoice. A participant funding BW-99 cannot set or change the organizer’s destination.

Only the verified city owner can request payout changes by default; city-content editors cannot redirect revenue. Require a signed request, destination preview and explicit confirmation; retain an audit trail and notify the owner. Super-admin recovery is a distinct reviewed action, not an ordinary editor capability. Existing invoices retain their destination and split version; changes apply to newly issued invoices.

## Stage 3 — verified NIP-05 and Lightning activation (BW-19)

Read the verified paid entitlement, signed approval, canonical slug, city identity and signed payout configuration. Reserve only the canonical city local part; alternative city names do not create extra financial identities. Reject name conflicts rather than replacing an existing Rustress user.

Provision the NIP-05 mapping and the LNURL-pay Prism configuration atomically where possible, then independently check `/.well-known/nostr.json?name=london`, required CORS behavior, `/.well-known/lnurlp/london`, callback routing and the 79% configuration. Use the canonical public origin when generating callbacks behind the proxy. Preserve existing NIP-05 entries and unrelated well-known endpoints.

Keep entitlement, city approval, NIP-05, Lightning, relay and chat status distinct in the CMS: **Setup required**, **Provisioning**, **Active**, **Needs attention**. Mark each capability active only after its own read-back. Failure retries reuse the city/configuration key. NIP-05/Lightning readiness does not depend on a dedicated city relay being available. City disapproval/archive policy must explicitly govern new invoice issuance while honoring already accepted invoice obligations; publishing suspension alone must not silently confiscate or redirect accrued payments.

## Stage 4 — durable 79/21 accounting and forwarding (BW-18)

Before issuing an incoming invoice, snapshot the city ID, destination version, 79/21 policy and amounts. Verify settlement against that exact incoming invoice and wallet. In one transaction record settlement and the organizer obligation with a unique key; duplicate notifications and reconciliation produce no additional credit.

Use integer millisatoshi accounting: organizer allocation `floor(received_msats * 79 / 100)`, remainder retained for BitcoinWalk. Carry sub-satoshi/minimum-payment amounts forward for the same destination version; do not silently forfeit them. Batch only compatible outstanding obligations and record their exact allocation to each payout. Respect recipient minimum/maximum amounts, with pending balances displayed clearly.

Persist each outgoing invoice/payment hash before sending. Decode and validate its amount, network, expiry and LNURL metadata commitment. Reconcile uncertain outgoing payments before requesting another invoice; a timeout is not proof of failure. Add leases/concurrency control, durable retries, restart catch-up and incoming settlement reconciliation after notification outages. Failed payouts remain owed to their original destination version. Receipt publication and payout processing use separate durable states.

Proposed fee policy: the organizer receives the full allocated 79%; BitcoinWalk pays outgoing routing fees from its share/wallet. Thus 100 sats means 79 sats received by the organizer and 21 sats allocated to BitcoinWalk **before routing fees**; the node’s net balance increases by 21 sats minus the fee. Confirm this business policy before live activation. Enforce supported wallet fee/budget controls and define the supported minimum incoming amount; payouts that cannot meet recipient limits or fee constraints remain pending.

For NIP-57, validate the incoming zap request against the city recipient and issue the receipt with the advertised service signing key for the original payment. A successful incoming zap receipt does not prove the organizer payout completed. Do not create a second donation/zap for the forwarded share or double-count it. Ordinary LNURL payments receive the same split without fabricated zap receipts.

## Stage 5 — acceptance and rollout (BW-102)

Test fixtures first, then an isolated Rustress/Alby connection and a reviewed London pilot. Confirm NIP-05 in a compatible client, ordinary LNURL payments and NIP-57 receipts. A user-authorized 100-sat test must yield one 79-sat payout, one 21-sat allocation and separately reported fees. Verify fractional amounts, minimum/maximum payments, invalid invoices, duplicate notifications, cross-city isolation, endpoint failures, uncertain sends, budget exhaustion, restart during payout and notification-outage reconciliation.

Confirm owner destination changes, editor/funder denial, old-invoice snapshots, credential rotation and rollback/restore without resending completed payouts. Restore tests use isolated state and no live spending credentials until reconciled with wallet history. Expose aggregate health and actionable pending/failed payouts in CMS monitoring without secrets. Add runbooks for wallet funding, unpaid obligations, destination changes, backups and disabling new payments while completing existing obligations.

Roll out to existing paid cities only after their owners provide a destination. Leave pending setup explicit. Extend future BW-99 upgrades using the same provisioning flow, and use independent capability statuses alongside BW-20/BW-23.

## Execution order and user input

BW-100 → BW-101 → BW-19 + BW-18 → BW-102. BW-18's reliable payout engine must pass acceptance before any public split-enabled address is activated. BW-20 and BW-23 can progress independently after their own dependencies.

At implementation time: identify the existing Rustress installation and its management access; configure the dedicated NWC secret directly on the VPS; confirm the city Nostr identity, owner payout destination and proposed fee policy; authorize the bounded live payment test and confirm receipt. Never paste NWC URIs or private keys into the backlog or chat.
