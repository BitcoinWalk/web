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

The credential file alone enables nothing. The maintained Rustress service must
later mount it read-only, keep it out of SQLite and logs, bind it to the exact
isolated Hub connection, and pass authenticated read-only capability/history
probes before invoice issuance or payouts are enabled. The first funded payment
remains a separate explicit authorization.

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
