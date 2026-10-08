# BW-100 — wallet permission preflight

8 October 2026. Implemented and tested locally; no wallet connection, permission,
funding, invoice or deployment changes. Madeira's isolated fixture remains intact.

`src/rustress/wallet-readiness.ts` is a pure, private evidence evaluator, not a
wallet client or activation endpoint. It is not wired into runtime provisioning.
It returns either `blocked` or `ready-for-authorized-test`, and **always** returns
`livePaymentsEnabled: false`. Passing it neither authorizes spending nor proves
that notifications, fees, outgoing settlement or recovery work end to end.

## Required evidence

The eventual trusted server-side collector must bind all records to one exact
connection and obtain policy from an explicitly approved server-side record.
Do not accept this evidence from browser JSON or a wallet's self-description.

- Separate opaque references for Rustress and the existing receive-only checkout
  connection. Never add pay_invoice to checkout.
- Authenticated Hub app inventory: granted get_info, make_invoice, lookup_invoice,
  list_transactions and pay_invoice; notification permission; revocation status;
  exact spending budget and remaining allowance; renewal and isolation state.
- The wallet's advertised methods, checked separately from actual app grants.
- Successful read-only get_info, lookup_invoice and list_transactions probes on
  that same connection. Inventory/advertising alone does not establish these.
- Explicit approved network, maximum pilot budget, maximum test payment and
  routing fee, expiry and evidence that the selected send path enforces the fee
  cap. There is no assumed user budget or fee-policy approval.
- Prefer a separate-balance wallet. Shared node balance requires explicit review.
  An isolated balance is not a substitute for a spending cap, and shared apps'
  reported zero app balance must not be mistaken for an empty node wallet.

Inventory and protocol observations expire after 15 minutes. Expired/revoked or
future-dated evidence fails closed. The first pilot requires a non-renewing
budget, enough remaining allowance for the approved test plus fees, and rejects
unnecessary broad methods such as sign_message. Credentials, NWC identifiers,
private relay URLs and raw provider errors are excluded from the input/output
contract. Reject extra fields; expose only fixed issue codes.

## Next safe operational steps

1. Obtain the user's Hub dashboard URL and establish protected, least-privilege
   read access. Never enter credentials over public plain HTTP or print secrets.
2. Read the authenticated connection inventory with redacted output. Verify the
   actual installed Hub/backend version and which controls it supports. Do not
   infer the wallet behind bitcoinwalk@getalby.com from its address alone.
3. Agree the separate connection, isolation, non-renewing budget, expiry and fee
   policy with the user. Creation/funding is a separate authorized operation;
   the current private Rustress fixture must never receive wallet credentials.
4. Add and test a read-only collector using the agreed connection. Prove the
   permission evidence is connection-bound and handle redaction and revocation.
5. Complete durable BW-18 obligations/reconciliation, BW-19 endpoint gating,
   backups and security review before a separately authorized bounded payment.
   A metadata preflight is not sufficient to activate public city addresses.

The Alby Hub skill's app/sub-wallet guidance informed connection separation,
scoped permissions, non-renewing pilot budget and isolated-vs-shared balance
handling. No Hub management command or NWC request was executed.

Tests cover invalid/secret-bearing input, advertised-vs-granted permissions,
checkout reuse, staleness, revocation, wrong network, excess scopes, incomplete
read probes, missing notifications, budget limits/renewal/fees, wallet isolation
and unsafe integer amounts. No live tests are claimed.

Access checkpoint: the user supplied `https://hub.bitcoinwalk.org/`. It loads
the Hub login screen over HTTPS. No saved local Hub CLI token exists (existence
checked only). Authenticated inventory is pending user login in the opened Hub
tab; no password, wallet connection or token was requested in chat.
