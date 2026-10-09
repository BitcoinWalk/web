# Rustress NWC credential handoff

The production Rustress connection is created in the existing Alby Hub as a
separate isolated app. The existing **Paid city** checkout connection remains
receive-only and must never be reused or granted sending permission.

The Rustress credential is installed once under the non-root `bitcoinwalk`
service identity. It must never be pasted into chat, a browser-based Rustress
admin page, a command argument, an environment file committed to Git, or shell
history. The public Rustress admin endpoint is not an acceptable handoff path.

`integrations/rustress/live-wallet/install-nwc-secret.sh` takes no arguments and
reads only from its controlling terminal with echo disabled. It validates the
NWC URI and atomically installs it at:

`/home/bitcoinwalk/.local/state/bitcoinwalk-rustress/secrets/nwc-uri`

The state and secrets directories are mode 0700 and the file is mode 0600. The
installer refuses root, other users, symbolic-link paths, pipelines and malformed
input. It never prints the credential. `check-nwc-secret.sh` emits only
`RUSTRESS_NWC_SECRET_READY` after ownership, permissions, file type, size and URI
shape pass.

The credential file alone enables nothing. A separate wallet shadow now mounts
it read-only, keeps it out of SQLite and logs, binds it to the exact isolated Hub
connection, and performs only authenticated capability/history probes. Invoice
issuance and payouts remain disabled. The first funded payment remains a
separate explicit authorization.

The currently created app accepts incoming invoices without an NWC receive cap.
BitcoinWalk policy will cap an incoming city payment at 1,000,000 sats. Its
non-renewing Hub spend allowance is 797,900 sats: up to 790,000 sats organizer
principal plus the accepted Hub-native maximum 7,900-sat routing fee. Budget
exhaustion must stop new payout attempts and surface an outstanding obligation;
it must not silently change the 79/21 allocation.

## Live read-only checkpoint — 9 October 2026

After the masked handoff, the exact bundled probe was checksum-verified and run
as non-root `bitcoinwalk` on the Rustress host. It read the credential only from
the protected file and returned a redacted result:

- network: bitcoin mainnet;
- advertised methods: `get_info`, `make_invoice`, `lookup_invoice`,
  `list_transactions` and `pay_invoice`;
- authenticated `get_info` and bounded `list_transactions` calls succeeded;
- history response shape passed;
- no invoice was created and no payment was sent.

The temporary official runtime was checksum-verified, used only for this probe
and removed from both machines afterward. No credential, relay, wallet pubkey,
balance, transaction or raw response was printed. The opaque connection binding
was checked operationally but is not recorded in public documentation.

This proves the connection can perform the two non-spending reads; it does not
prove granted app inventory, invoice lookup for a known BitcoinWalk invoice,
budget consumption, notification delivery, settlement reconciliation or payout
safety. Those gates remain before service activation.

## Rootless wallet shadow checkpoint — 9 October 2026

Version 0.1.1 is active in the `bitcoinwalk` user's rootless Docker daemon on
the Rustress host. It uses the exact pinned official Node 24 Alpine digest and:

- binds only to `127.0.0.1:8892`;
- mounts the NWC credential and a separate API token read-only from owner-only,
  mode-0600 files;
- starts only in a verified rootless user namespace, reads those files and
  immediately drops to UID/GID 1004 before opening its listener;
- runs with a read-only root filesystem, no privilege escalation, a minimal
  temporary filesystem, CPU/memory/PID limits and zero effective capabilities;
- exposes a redacted health response and a token-protected readiness response;
- implements only `get_info` and bounded `list_transactions(0, 1)` calls;
- returns 404 for admin, well-known, callback and payment routes; and
- reports invoice issuance and payouts disabled in both health surfaces.

Live acceptance returned `RUSTRESS_WALLET_SHADOW_READY`, bitcoin mainnet and
authenticated history readability. Unauthenticated readiness returned 401 and
all public-style routes returned 404. Logs contain no NWC URI, relay or secret.
The original public Rustress listener still returns 401 on port 8889 and lives
in a separate root-owned Docker daemon that the deployment user cannot inspect
or modify.

This closes protected-file consumption and persistent non-spending health
probing. The shadow intentionally has no invoice-creation, invoice-lookup or
payment interface.

## Unpaid invoice and notification-channel checkpoint — 9 October 2026

A separate checksum-verified one-shot tool used the same rootless, mode-0600
credential boundary to create one hidden 1-sat invoice with a five-minute
expiry. It did not print the invoice or payment hash. Exact lookup returned the
same incoming amount, invoice, description and payment hash in `pending` state;
the decoded BOLT-11 amount was exactly 1,000 msats. No payment was sent.

Before invoice creation, the tool verified the exact wallet-signed NWC info
event advertises `payment_received` and received EOSE for a connection-bound
subscription to both legacy and current notification kinds. This proves the
permission advertisement and relay subscription path. It does **not** prove
delivery of `payment_received`: that event is emitted only after settlement,
which would move funds and requires separate explicit authorization.

Known-invoice lookup is therefore closed. Authenticated Hub app inventory,
actual notification delivery, retained-history/backup monitoring, credential
rotation and funded acceptance remain open.
