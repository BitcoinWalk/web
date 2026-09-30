# BW-17 — paid city invoice checkout

Payment implementation target: staging app `0.3.77`; dashboard visibility is
extended in `0.3.78`. These releases replace the rejected,
never-activated `0.3.76` remote payment-service design. Alby Hub continues to run
unchanged on `.240`; there is no BitcoinWalk payment container, SSH tunnel or API
token on that host.

The web app on `.138` talks directly to Alby Hub through a dedicated NWC
connection with only `make_invoice` and `lookup_invoice`. Never grant
`pay_invoice`, keysend, transfer, signing or administrative permissions.

## Storage and authority

Signed Nostr events remain authoritative for cities, organizers, approvals,
revocations and walks. Private payment operations are recorded in the app-owned
payment SQLite database on the same `.138` VPS:

```text
/var/lib/bitcoinwalk-app-staging/payments.sqlite
```

`payment_invoice` stores durable orders, BOLT11 invoices, payment hashes and
lookup status. `paid_city_entitlement` stores the locally verified Pro tier.
The NWC URI and preimages are never stored in SQLite. Payment data is
not published to the public Nostr relay or mixed into a relay or Guide database.

## Organizer and admin flows

Selecting Pro and publishing the signed city request opens checkout. The server
re-reads the signed revision from the authoritative relay, requires the city
creator, and refuses free, unknown, rejected or revoked requests. It then asks
Alby Hub for exactly **21,000 sats (21,000,000 millisatoshis)**.

The decoded BOLT11 network, amount, expiry and payment hash must match the NWC
response. The order is inserted before NWC is contacted; the exact invoice and
hash are committed before the browser receives them. The organizer gets a QR
code, lightning link, copyable invoice and expiry. `/admin` shows the organizer's
own rows; a freshly signed super-admin request can show all rows.

The app reconciles pending invoices every 15 seconds even when the organizer has
closed the browser. Pro requires a matching incoming invoice, exact amount,
settlement time and SHA-256 preimage proof. Invoice and entitlement updates share
one immediate SQLite transaction. Wallet errors never downgrade a paid city.

Pro settlement does not itself approve a city or provision its dedicated relay,
community, NIP-05 or lightning address. Those remain separate BW-19/BW-20/BW-23
gates. The future 79/21 city-payment split is not part of this one-time purchase.

## Duplicate and recovery controls

Concurrent requests reuse one stored pending invoice. Every previous hash is
looked up before an expired invoice can be replaced. Renewal is limited to five
invoices per city per day. A paid city cannot receive another purchase invoice.

If invoice creation times out after publication, the durable order becomes
`creation-uncertain` and blocks a replacement. An operator must reconcile its
order UUID against Alby Hub and restore the exact invoice/hash with reviewed
recovery tooling. Never delete the row merely to generate another invoice.

SQLite uses WAL, `synchronous=FULL` and a five-second busy timeout. The current
single app process is the writer. Before horizontal Docker scaling, move the
shared state to a transactional server database or retain exactly one writer.

## Configuration and activation

On `.138`, keep `/home/bitcoinwalk/.config/bitcoinwalk/app.env` owned by
`bitcoinwalk:bitcoinwalk`, mode `0600`:

```dotenv
BITCOINWALK_NWC_URL='nostr+walletconnect://REPLACE_WITH_THE_COMPLETE_CONNECTION'
BITCOINWALK_PAYMENT_DATABASE=/var/lib/bitcoinwalk-app-staging/payments.sqlite
BITCOINWALK_PAYMENT_APP_ORIGIN=https://app-staging.bitcoinwalk.org
```

Do not paste the NWC URI into chat, shell history, Git or an installer argument.
The same file is suitable as a future Docker `env_file`. The persistent user
service reads it and runs the app as `bitcoinwalk`; the value is not copied into
the release artifact.

After the one-time user-service bootstrap, activate the packaged app with
`/home/bitcoinwalk/bin/deploy-staging-app` as the ordinary `bitcoinwalk` SSH
user. The old `install-city-payments-direct-0.3.77.sh` system-unit path is
superseded and should not be retried.

## Live acceptance completed

On 28 September 2026, the staging workflow generated a genuine 21,000-sat
invoice from an eligible signed Pro request and the user paid it to the
BitcoinWalk Alby wallet. Organizer and super-admin UI acceptance succeeded.
Aggregate, read-only SQLite verification found exactly one `paid` invoice for
21,000,000 millisatoshis and exactly one paid-city entitlement. Both remained
present after a non-root app restart. Verification deliberately did not print
the invoice, payment hash, preimage, NWC URI or organizer identity.

Automated coverage retains authorization, organizer isolation, strict
settlement/preimage checks, idempotency and wallet-failure behavior. Tests and
deployment never spend funds automatically.

## Dashboard visibility

App `0.3.78` adds role-scoped payment visibility to `/admin`; `0.3.79` makes
the same verified entitlement authoritative in City Management:

- the super-admin can load every payment record with city, invoice status,
  effective tier, amount, payment hash and last-check time;
- an organizer can load all of their latest signed city requests, including
  Basic cities with `No payment required` and Pro cities with their current
  payment status and payment hash;
- another organizer's cities and payments remain excluded by the signed API
  identity and are also excluded when merging relay city records in the UI;
- invoices, preimages and the NWC connection are not rendered in either list.
- City Management displays a verified Paid tier and payment hash, disables
  paid-city archive, refreshes payment state immediately before archive, and
  fails closed when tier verification is unavailable. Static provisioning
  inventory remains a second paid signal, not the sole source of truth.

The organizer's Pro checkout remains below the table. A paid entitlement is
never downgraded by a later city revision or a temporary wallet outage.

BW-61 remains paused. Payment work does not migrate the Memphis replica.

