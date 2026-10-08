# BW-109 — super-admin standalone Lightning addresses

Requested 8 October 2026. Planned; no addresses provisioned.

Initial requested addresses: `endo@bitcoinwalk.org`, `donate@bitcoinwalk.org`.
The user confirmed `bitcoinwalk@getalby.com` as the receiving destination for
both on 8 October. This confirms the destination, not its underlying NWC wallet
or node identity. Verify that mapping during inventory. Prefer issuing invoices
directly from that receiving wallet rather than adding a receive-and-forward hop.
If it is a different wallet, review the alias/direct-invoice integration before
activation; do not silently introduce an outgoing payment/fee path.

## CMS flow

Add an Address management view in the appropriate super-admin payments area:
local part, approved receiving-wallet selector, **No split — 100% to selected
wallet**, readiness/status and create/disable controls. Wallet references are
preconfigured privately; never request NWC credentials in the browser. Ordinary
organizers, city editors and gift payers cannot use this API. Require a fresh
super-admin signed, origin-bound command covering exact address, wallet reference
and configuration version; replay and stale updates fail closed.

After that one administrative request, configuration, verification and status
updates run automatically. No Rustress dashboard work is required. Preserve
audit history for wallet changes and disabling new invoices. Never rewrite the
destination of existing issued invoices or delete settlement history.

## Provider model

Separate standalone-address resource from city configurations. No city ID,
entitlement, payout destination or 79/21 Prism is required. Absence of a split is
explicit, not a recipient set to zero percent. An address receives 100% into its
selected wallet without the city 79/21 allocation. Prefer direct receipt with no
automatic forwarding. Keep this on a
receive-only connection where supported; it must not inherit the city's spending
scope solely because the services share a host.

Global domain/local-part uniqueness must cover both managed resource types and
all existing Rustress users. Reserve `endo` and `donate` against automated city
provisioning once inventory confirms they are available. Existing entries—even
with the same name—require an explicit verified adoption rather than overwrite.
Use atomic transactions, compare-and-swap versions, phase-specific idempotency
and independent read-back. Public invoice issuance stays disabled until endpoint
checks and the separately approved live pilot pass.

Only LNURL-pay is requested. NIP-05 and NIP-57 recipient identities need explicit
public-key choices and separate verification; do not invent them from names.
`donate@bitcoinwalk.org` is a candidate for BW-107's Basic donation destination,
with `bitcoinwalk@getalby.com` confirmed as its recipient. Wire it only after
the provider-to-wallet mapping is verified and activation passes. Do not redirect
existing donations or checkout during this work.

## Tests and dependencies

Depends on BW-100's patched/private provisioning API; independently verify
LNURL-pay metadata/callback/amount limits and disabled/error states. Test wrong
role, replay, cross-city/address collision, duplicate creation, provider restart,
failed read-back, changed receiving wallet and previously issued invoices.
Verify that there are zero Prism recipients and no outgoing payment RPC for
this resource type. A real receipt test needs separately bounded user approval.

Delivery order: inventory and private API; isolated transactional integration;
city automation under BW-19 and standalone adapter variant under BW-109; CMS
commands; verified public routing; user-approved live acceptance. Financial
activation remains gated independently from code deployment.
