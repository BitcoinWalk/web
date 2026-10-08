# Rustress city identity and Lightning provisioning

Implementation plan agreed in scope on 7 October 2026. Planning only: no wallet permissions, payments, city mappings or services are changed by this document.

## Product behavior

Public walk payment actions are tier-aware (BW-107). Pro keeps **Zap the host**, targeting the verified city Lightning address with the 79/21 split. Basic shows its organizer but offers **Support BitcoinWalk** instead of a host payment: all donated principal goes to the configured BitcoinWalk organization destination, with no organizer split. Confirm that destination before activation. The Basic card must not offer a competing personal Lightning payment shortcut. Donations do not purchase Pro; BW-99 remains a separate gift-upgrade action. Unknown tiers cannot select a recipient; Pro setup pending must not silently redirect a payment to BitcoinWalk. Verify tier and destination at invoice creation and clearly show the recipient.

When an organizer selects Pro in registration Step 3, require **Your Lightning address or LNURL** before checkout. Accept a Lightning address such as `organizer@example.com` or a valid LNURL-pay `lnurl1…` value. Explain: “79% of payments to your city’s BitcoinWalk Lightning address goes to this destination. BitcoinWalk retains 21%.” Validate and confirm the destination before showing the existing 21,000-sat invoice. Basic registration has no required payout field.

After verified Pro settlement and signed city approval, provision the canonical address, for example `london@bitcoinwalk.org`, in Rustress for both NIP-05 and LNURL-pay. Configure one Prism recipient at 79%; the remaining 21% stays in the BitcoinWalk receiving wallet. A settled 100-sat payment creates a 79-sat organizer obligation and 21-sat BitcoinWalk allocation. The one-time 21,000-sat Pro purchase is separate and does not enter this split.

NIP-05 maps the city address to a dedicated branded city Nostr account, named **BitcoinWalk in <city>**, created or connected during Pro setup. The personal account remains the owner's dashboard identity; its private payout destination receives 79%. Neither the personal profile nor directory ownership is automatically renamed or transferred. The branded account replaces the person in the public **Hosted by** component. Its profile contains the generated city avatar, banner, website, NIP-05 and city Lightning address; the owner reviews and signs it with the city account. Existing dedicated city accounts can be connected after proof of control.

## Branded account design and setup (BW-103–BW-106)

Exceptional existing paid cities: [BW-108 MEP](migrate-existing-paid.md) reuses an organizer-controlled dedicated city identity. London's immediate acceptance criterion is that this key appears as host on every `/london` page. A separately authorized ownership transfer may make it both owner and brand, but requires an explicit protocol/setup exception; it is not an automatic branding action. Existing entitlement is preserved with no repurchase. NIP-05 and city Lightning activation retain their independent verification gates.

### Stage A — account authority and privacy contract (BW-103)

Model separate values for the verified city owner, branded city npub, authorized editors, signed event author and private payout destination. A public city-account binding contains city ID, branded npub, version and activation state. The server verifies a fresh owner authorization against existing ownership evidence plus proof signed by the city account; persist owner authorization privately and publish the minimum approved binding needed by clients. Review existing public permission/directory schemas for unavoidable identity links. Do not silently create a new public personal-to-city mapping merely for display, and do not promise anonymity: historical signed events and existing public ownership records remain inspectable.

Specify a versioned relay policy and approval path for city-account binding, replacement and revocation. Reject foreign-city bindings, stale ownership, duplicate activation, replay and donor/editor attempts. Using the city signer to publish a walk must not grant it personal payout-change or directory-owner powers. Loss of a city key uses an explicit reviewed replacement flow; never infer ownership from a matching profile name/NIP-05. Preserve the stable city ID, paid entitlement, existing editor access, signed history and existing URLs. BW-34's optional personal-profile rebranding is separate future scope; this journey creates a distinct identity.

### Stage B — automatic avatar and profile assets (BW-104)

Reuse the approved hero background and deterministic BitcoinWalk assets from BW-82/BW-87/BW-15. As refined by the user on 7 October, render a square avatar with the enlarged BitcoinWalk icon and **no city lettering**; the profile username already identifies the city. Keep a circular safe area and do not crop a finished 1200×630 OG image. The wider profile banner retains the city name. This is deterministic image composition, with no new AI generation step or per-account manual artwork task.

Version and cache the avatar/banner by city, approved artwork version and template. Store public content-addressed images through the existing media pipeline. Preview square, circular and small profile sizes; test long banner names, accents, contrast and missing backgrounds. The renderer supports a neutral missing-hero fallback, but the guided preparation screen requires the approved photo to be restored before proceeding. Assets and profile URLs must not expose personal identities or payout information. Name/hero changes prepare new assets and a profile update for the city signer; they cannot silently rewrite an already signed profile. Rollback preserves old URLs.

### Stage C — one resumable activation screen (BW-105 + BW-101)

Implementation checkpoint: the default-off owner-authenticated preparation preview is implemented; payout confirmation, persisted setup stages, city signer and actual activation are not yet connected. See [current evidence and remaining gates](pro-city-setup.md).

After self-purchase or gift settlement, **Complete Pro setup** presents: the prefilled city profile and avatar preview, the personal payout input/confirmation, and **Create city account** or **Connect existing city account**. Payout details supplied before an organizer's own checkout are retained and shown for confirmation. New-city approval remains a separate activation gate.

Create/import the city key in an organizer-controlled signer when supported. Provide a browser-local key-generation fallback with a recovery backup and explicit import/reconnection guidance; no city nsec is sent to the BitcoinWalk server or placed in persistent browser storage. Verify actual signer capabilities before offering account creation: a generic browser extension or NIP-46 connection does not guarantee a create-account method. Do not replace the personal login session while connecting the second city signer. Require a city-signature proof after connection and confirmation of a usable recovery backup before activation.

Prefill profile name, city description, website, avatar and banner. Guide the owner authorization, city proof and profile signatures in a single screen; do not promise a single signer prompt across all providers. Recheck the expected pubkey for every signature to prevent an extension account switch from renaming the personal profile. Publish `nip05` and `lud16` only when the corresponding Rustress endpoints are verified; a provider may require a later profile signature. Keep a durable task with completed stages and safe retry so cancellation, refresh or missed DMs does not create a second account or another purchase invoice. If an unbacked-up local key is lost, require reconnect/recovery before proceeding.

Payment alone must not create a custodial account. Minimum organizer input is personal payout confirmation, city account creation/connection and recovery backup, followed by guided signatures; all artwork and profile fields are prepared automatically. A managed city signing service is not part of this plan.

### Stage D — public Hosted by replacement and future signing (BW-106)

Once the branded binding/profile are approved and verified, public **Hosted by** shows only the city account's avatar, name, shortened npub, verified NIP-05 and city Lightning address, retaining copy/copied behavior. Replace the personal card rather than adding a second identity. Apply the same policy to adjacent organizer labels, profile links, tooltips, accessible text and server-rendered profile data so the personal component is not merely hidden with CSS. Keep owner information in authorized CMS views. If an activated city's branded profile cannot load, use city artwork/name/npub or an unavailable state, never fall back to the personal profile. Basic cities continue showing their organizer, with the BitcoinWalk donation action defined in BW-107 replacing direct host payment.

Audit structured metadata and outgoing zap targeting: public city-address payments target the branded profile. A historical walk's event author remains its original signer, so do not rewrite its nevent/signature or manufacture an event zap that claims a different author. Use the city-profile Lightning payment path for the branded card and preserve exact historical records. Existing public Nostr provenance remains discoverable; this feature provides public presentation privacy, not erasure of the protocol history.

Future walks may be signed by the city account after explicit relay authorization and a connected city signer. Personal dashboard login is sufficient for management but cannot cryptographically sign as the city account. If its signer is missing, offer **Connect city signer** and keep the draft pending; do not silently fall back to the personal signing key. Verify recurrence, cancellation, delegation, authorization and moderation for the new author. Existing personal-authored walks retain their valid update/cancellation authority and are not republished during upgrade. Directory ownership rotations, if later desired, require their own explicit workflow.

## Verified upstream baseline

Reviewed [Rustress source](https://github.com/frnandu/rustress/tree/c72fdeccd80025d181efc1b1d45baeb8bfbde4a9), commit `c72fdeccd80025d181efc1b1d45baeb8bfbde4a9`, on 7 October 2026. Before implementation compare this with the installed instance and pin the tested release.

- Rustress implements NIP-05, LNURL-pay, NIP-57 receipts and Prism splitting. Its documented partial-percentage split retains the remainder in the wallet.
- Prisms require NWC `pay_invoice`; receiving invoices alone is insufficient. Preserve BW-17’s existing `make_invoice`/`lookup_invoice` connection. Supply Rustress with a separate, revocable connection for invoice creation, settlement lookup, outgoing payment reconciliation and received-payment notifications, with the minimum supported methods established against the actual Alby Hub version.
- `process_prism_payment` currently resolves `user@domain` recipients only, calculates using floating point and skips splits below 1,000 msats. Supporting raw LNURL-pay is implementation work.
- Settlement is claimed before forwarding. Per-recipient failures are logged; the reviewed database has no durable payout-obligation/retry table. A restart or uncertain payment must not lose the organizer’s share or produce a second payout.
- The forwarding path needs explicit remote-endpoint protection, recipient invoice amount/network/expiry/metadata validation, fee limits, and removal of payment preimages and sensitive response logging.
- Admin routes provide browser-session management. Do not assume a stable, restricted machine provisioning API exists. Add a narrow authenticated server-to-server adapter/API in Rustress, with transactionally applied configuration and read-back, instead of automating its dashboard or writing directly to its database.

## Stage 1 — Rustress integration and wallet boundary (BW-100)

8 October checkpoint: the isolated app-side client and versioned disabled-only
provisioning contract are implemented with fixture tests. The companion Rustress
API is not yet implemented or deployed; the installed `.240:8889` instance still
needs non-root inventory access. See [adapter scope and remaining work](rustress-adapter.md).

Inventory the existing Rustress instance, version, domains and NWC capabilities without printing credentials. Prepare a pinned deployment or maintained patch set for the integration and payout requirements below. Use the existing non-root VPS deployment account and a service identity with protected persistent storage. Keep Rustress administration private and route only required public NIP-05/LNURL endpoints through the apex reverse proxy; BitcoinWalk’s `/admin` continues to serve the CMS.

Create a separate Rustress NWC connection, with a limited budget and preferably a dedicated wallet/sub-wallet funded for incoming payments and routing fees. Confirm supported permissions and notification behavior before enabling spending. Keep credentials server-side in protected storage, exclude them from API responses/logs and encrypt backups containing Rustress’s credential-bearing database. Define revocation, rotation and recovery. A paused or budget-exhausted wallet leaves an outstanding obligation visible.

Deliver a restricted, authenticated provisioning interface keyed by city ID and configuration version: prepare, apply, read status, update destination and disable new invoice issuance. Enforce unique domain/local-part claims, idempotent retries and atomic user-plus-split changes. Reconcile only BitcoinWalk-managed entries; do not overwrite unrelated users in the existing Rustress instance.

## Stage 2 — organizer payout onboarding (BW-101)

Use one reusable destination input for Pro registration, existing Pro-city setup, owner edits and future BW-99 upgrades. Normalize Lightning addresses and decode LNURL-pay. Validate public HTTPS endpoints and callbacks with bounded responses/timeouts, redirect and DNS-rebinding protection, LNURL-pay type and supported amount range. Reject self-referential city addresses and known managed split cycles. Never request the organizer’s NWC connection or private key.

Save an owner-signed, city-scoped destination version through an authenticated API, using private provisioning storage unless a separately reviewed public schema is required. Bind organizer checkout to the validated version; gift checkout binds to the city and allows missing owner payout details. A later successful payment must remain recoverable even if validation or provisioning subsequently fails. Existing paid cities without a destination show **Setup required** and never receive another Pro purchase invoice. A participant funding BW-99 cannot set or change the organizer’s destination.

### Organizer purchases Pro

For a new city, show the payout input directly under Pro in registration Step 3. For an existing Basic city, its owner can choose **Upgrade to Pro** from My cities or the public walk page, connect their signer and complete the same input before checkout. If a previously owner-confirmed destination exists, show it for explicit confirmation; public profile Lightning metadata may be offered as a suggestion, never silently adopted. Show the city, normalized destination and 79/21 terms together before the owner signs. Invalid input blocks invoice creation with an actionable field error; validation makes no test payment. After settlement, route the owner to that city's dashboard with the capability status and a retry action if provisioning fails.

### Someone gifts the city an upgrade

1. On any published walk page for an eligible Basic city, a visitor chooses **Gift Pro to this city**. Show the city receiving the upgrade and explain that its organizer will complete payout setup if needed. The giver can pay without knowing the organizer's personal LNURL; do not present a payout-destination field to the giver.
2. After verified settlement, persist one city-wide Pro entitlement and one durable owner-setup task. Show the giver **Pro upgrade paid** and, where necessary, **Organizer setup pending**. Do not expose the organizer's personal destination. Deduplicate concurrent self-purchase/gift attempts and retain the BW-99 late-payment recovery policy.
3. Notify the current verified city owner through BitcoinWalk Guide with a city-specific dashboard link. Add a persistent card in My cities and the dashboard: **Your city received a Pro upgrade — add your Lightning address to receive your 79% share**, with **Complete Pro setup**. Failed DM delivery retries without losing the dashboard task. The link contains no credential and grants no authority; after login the server rechecks city ownership and verified payment.
4. The owner supplies or confirms their personal Lightning address/LNURL through the shared component, reviews the split and signs the city-scoped version. Existing owner-confirmed details may be reused only after revalidation; unsigned profile metadata and donor input never qualify. Provision once from the resulting verified configuration and entitlement, without a second checkout. Notify the owner when Lightning activation is verified.
5. Until a valid owner-confirmed destination exists, keep city Lightning invoice issuance disabled and show **Pro paid — Lightning setup required**. Other Pro capabilities can show their own readiness. Never route the missing 79% to the giver or treat it as BitcoinWalk revenue. Closing the browser, missing a DM or changing devices preserves the paid entitlement and setup task. A later owner login resumes it; stale links and previous owners cannot change the destination. If ownership cannot be resolved, show a super-admin recovery task.

The setup task is keyed by city and entitlement, records completion against a destination version, and is cleared only after verified provisioning. Owners may always return to **My cities → Pro setup → Payout destination** to inspect status or request an authorized destination change. BW-101 delivers the reusable setup and recovery flow; BW-99 connects gift settlement to it. BW-101 can be tested with fixture entitlements before the future gift checkout is implemented.

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

Acceptance covers organizer Pro registration and existing-city self-upgrade, plus gift settlement with absent, valid and stale destinations. Verify Guide delivery failure, cross-device completion, an owner who never completes setup, unauthorized giver/editor/previous-owner access, repeated setup submissions, simultaneous gifts/self-purchase and restart between payment and notification. Paid status must survive every recoverable setup failure; no second purchase invoice is generated and city Lightning invoices remain disabled until payout setup is verified. Exercise these states with fixtures under BW-101/BW-102 and repeat the complete public gift journey when BW-99 is implemented.

## Execution order and user input

Recommended sequence: BW-103 (authority contract), then BW-104 (artwork) and BW-100 (Rustress adapter), then BW-101/BW-105 (payout and account setup), then BW-18/BW-19 (reliable splits and verified endpoints), then BW-106 (public replacement and city signing), then BW-102 (combined pilot acceptance). BW-99 remains future scope and uses the same setup task; fixture gift entitlements test recovery before its public checkout is built. BW-20 and BW-23 keep independent relay/chat readiness gates. No circular dependency on gift checkout is introduced.

BW-102 also accepts the complete branded-account journey: self-purchase and fixture gift, existing/new city signer, backup/reconnection and account-switch tests, circular-avatar legibility, signed profile publication, NIP-05-to-city-npub read-back, private destination exclusion, public Hosted by replacement with no personal fallback, historical URL preservation, future city-author signatures, cancellation/moderation, and durable setup retry. Real gift checkout acceptance is repeated under BW-99 when implemented.

At implementation time: identify the existing Rustress installation and its management access; configure the dedicated NWC secret directly on the VPS; confirm the city Nostr identity, owner payout destination and proposed fee policy; authorize the bounded live payment test and confirm receipt. Never paste NWC URIs or private keys into the backlog or chat.
