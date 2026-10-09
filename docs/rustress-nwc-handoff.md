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
