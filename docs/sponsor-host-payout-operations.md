# Sponsor host payout operations

BW-92 uses a dedicated sponsorship-only payment rail. It must not reuse the
city-zap wallet, sponsorship checkout connection or either payment ledger.

## Disabled deployment package

`scripts/package-sponsor-payout-service.sh` produces the deterministic
`bitcoinwalk-sponsor-payout-service-0.1.0.tar.gz` package. Its first deployment
mode is deliberately inert:

- rootless Docker with a read-only filesystem, no network and all capabilities
  removed;
- no NWC credential mount and no wallet, invoice, payout or invitation access;
- a loopback-only health check that reports payouts and host invitations off;
- a durable service-generation marker whose SQLite integrity is checked after
  every restart;
- a six-hour verified SQLite backup and a fifteen-minute service/backup
  watchdog; and
- automatic rollback if the replacement container fails its disabled-state
  verification.

Install only as the non-root `bitcoinwalk` deployment user:

```sh
cd /home/bitcoinwalk/incoming/bitcoinwalk-sponsor-payout-service-0.1.0
./install-disabled.sh
```

Successful installation ends with:

```text
Sponsor payout service 0.1.0 installed safely disabled. No credential loaded and no funds moved.
```

The service is not acceptance evidence for live payout authority. Its
`restartReconciliation` value remains `blocked-disabled` until the separately
reviewed wallet-history and off-host journal reconciliation can complete.

## Activation gates still required

Do not change the mode file or set
`BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED=1` yet. Activation still requires:

1. a private credential handoff that never places the NWC URI in chat, Git,
   shell history, logs or a deployment archive;
2. authenticated inventory and protocol evidence for the exact isolated Alby
   connection, including the 100,000-sat non-renewing lifetime cap;
3. encrypted off-host journal backup/restore and complete outgoing-wallet
   history reconciliation after restart;
4. a maximum-seven-day signed operation restricted to reviewed staging cities;
5. an explicitly approved, minimally funded staging payout; and
6. proof that normal city zaps, sponsorship checkout and super-admin sponsor
   invitations remain unchanged.

The wallet remains unfunded until the user separately authorizes a transfer.

## Disabled host acceptance — 16 October 2026

Package `0.1.0` was checksum-verified and installed as the non-root
`bitcoinwalk` account on the payout host. The container is rootless, read-only,
has Docker network mode `none`, mounts only the read-only `disabled` mode file
and its writable state directory, and exposes no host port or credential mount.
Its aggregate health stayed disabled across a real restart while the durable
generation advanced from 1 to 2. Backup/restore verification produced
`service-20261016T104529Z.sqlite`; the backup and monitor timers are active and
the monitor accepted a one-second-old backup. The independent Rustress service
remained unchanged at version `0.2.14`, mode `operation`, state `running`.

This evidence authorizes no payout. Health still reports
`restartReconciliation: blocked-disabled`, zero wallet access and both payouts
and host invitations disabled.

## Private wallet handoff checkpoint — 16 October 2026

The isolated **BitcoinWalk Sponsor Payout** connection has a zero balance, a
100,000-sat non-renewing lifetime budget and only the required payment and
recovery-read permissions. An accidentally disclosed predecessor credential was
never installed and its Hub connection was revoked before use. The replacement
credential was pasted directly from Hub into a masked terminal prompt; it did
not pass through command arguments, environment variables, shell history, Git
or deployment archives.

Package `bitcoinwalk-sponsor-payout-readiness-0.1.1` stores the credential below
the non-root `bitcoinwalk` account's mode-0700 state directory in a mode-0600
file. The exact bundled one-shot probe then authenticated to the wallet on
Bitcoin mainnet and successfully performed only `get_info` and a one-row
`list_transactions` read. It created no invoice and sent no payment. Redacted
evidence is retained owner-only at
`readiness/nwc-readiness.json`; the probe prints no wallet identifier, relay,
balance, transaction or secret.

After the read, the persistent payout container remained version `0.1.0`, mode
`disabled`, network `none` and state `running`. Its credential is not mounted
into that container. This closes the private handoff and non-spending protocol
readiness gate only; it does not authorize service activation or wallet funding.

## Disabled monitoring repair and fee-cap result — 16 October 2026

The first scheduled backup/monitor run exposed a host-specific systemd boundary:
any private mount namespace on this rootless Docker installation loses access to
the user Docker socket. Removing the sandbox was rejected. Release `0.1.1`
instead removes the timers' Docker dependency: the networkless disabled
container atomically refreshes a mode-0600 heartbeat, and sandboxed Python 3.12
tools verify its exact disabled state, SQLite generation/integrity and online
backup/restore. The service remains read-only, capability-free and Docker
network `none`. Both systemd units returned success, both timers are active and
the monitor accepted a fresh owner-only backup.

An authenticated `get_info` call through the exact replacement NWC connection
then returned `SPONSOR_PAYOUT_NATIVE_FEE_CAP_NOT_ADVERTISED`. The live Hub's
isolated 100,000-sat lifetime budget is verified, but it is not a per-payment
fee ceiling. Generic NIP-47 method advertising and the stopped reviewed Hub
candidate do not satisfy the native fee-safety contract. Payout activation and
wallet funding therefore remain blocked until the live Hub supplies equivalent
reviewed fee enforcement or the sender uses another independently verified
fee-bounded transport.

## Production fee-cap Hub checkpoint — 16 October 2026

The reviewed fee-cap Hub revision is now live in production. Its exact binary
and migration artifacts had already matched the isolated candidate byte for
byte; copied initialized state, rollback, encrypted backup and custodian-only
restore rehearsals passed before cutover. The final production transition took
three seconds. After manual unlock, local and public checks reported the exact
fee-cap revision running on Bitcoin mainnet and SQLite integrity passed.

The stopped predecessor and temporary plaintext rollback snapshot were removed
only after explicit user approval. Encrypted local and off-host backups remain.
The sponsor-payout service is still version 0.1.1, disabled, networkless and
unfunded, and no invoice or payment was created. This supplies the reviewed
native fee-ceiling path that was previously an open activation gate; it does not
activate the sender or authorize funding or a payout.

## Invitation scope and super-admin audit

Host invitations may be city-wide or bound to one exact currently available
walk. The walk identifier is covered by the host's Nostr signature, retained in
the hash-only capability record and rechecked before invoice creation. A
walk-scoped invitation always creates a one-walk order for that exact walk;
changing the package or selection fails before wallet access.

The super-admin **Host payouts** view is audit-only for settled money. It shows
the invitation scope and the immutable received, host and retained amounts. Its
signed safety override can revoke future uses of an invitation, with the actor
and signed event retained durably. It cannot alter an already accepted checkout,
change a payout destination or version, edit the 79/21 arithmetic, mark an
obligation paid, or remove an obligation.

The ordinary public city-zap, LNURL callback, hosted-by and Rustress gateway
regression suites remain separate from this route and passed unchanged. The
payout wallet remains disabled and unfunded; a real staging payout still needs
separate explicit authorization.

## Staging acceptance checkpoint — 16 October 2026

Staging app `0.3.390` deployed the walk-scoped invitation and super-admin audit
surface from reconciled commit `936450b`. The complete combined tree passed
1,808 tests, lint, type checking, optimized build, deterministic packaging and
standalone package smoke. Non-root deployment evidence is retained at
`/home/bitcoinwalk/backups/app-staging-deploy.cepUCW`; public and loopback health
both identify `app-staging-0.3.390`.

Deployment did not enable the payout flag, mount the payout credential, fund
the isolated wallet or send a payment. Interactive signed-flow acceptance and
the explicitly authorized minimal staging payout remain separate gates.
