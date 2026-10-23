# Sponsor host payout operations

BW-92 uses a dedicated sponsorship-only payment rail. It must not reuse the
city-zap wallet, sponsorship checkout connection or either payment ledger.

## Disabled deployment package

### Single-order staging runner candidate — 23 October 2026

Runner `0.1.2` is a separate executable, not an update to the running disabled
service. Build with `npm run sponsor-payout-order:package`. The archive contains
only the bundled runner, these instructions and checksums; no credentials,
database, signed approval or deployment configuration. It requires Node 24.
No installer, listener, recurring job, wallet funding, invoice issuance or
journal activation is included.

The integration now connects the canonical sponsorship database, exact signed
order authority, owner-signed destination, dedicated NWC wallet, authenticated
Hub fee capability, fresh operator evidence, full outgoing-history recovery and
the independently hosted journal. This supersedes the missing-entry-point note
below for local implementation only. Production activation and live acceptance
are still outstanding.

#### Private preparation contract

Run beside the **canonical staging checkout database**, never against a copied
export or production database. Deployment placement and any private credential
handoff must be reviewed before installation; do not move the existing payout
credential automatically. The journal must be sponsorship-only, independently
hosted and reached through an already verified private loopback tunnel.

The configuration directory and database directory must be owner-only `0700`;
all input files and the existing database must be regular, owner-owned `0600`
files, with no symlinks or hard links. The runner never reads an admin private
key. It takes these files from its explicit private configuration directory:

- `config.json`: `environment: "staging"`, the absolute canonical `database`
  path, `binding`, `walletRef: "bitcoinwalk-sponsor-payout"`,
  `journalServiceId`, private `journalOrigin`, `budgetMsat`,
  `maximumPayoutMsat`, `maximumFeeMsat`, exactly one `cityIds` entry, public
  `checkoutClientPubkey` and `zapClientPubkey` separation pins, and `order`.
- `order` binds `orderId`, incoming settlement `paymentHash`, `receivedMsat`,
  `hostPubkey`, immutable `payoutVersion` and `destinationFingerprint` (SHA-256
  of `cityId:version:normalizedDestination`). All amounts are decimal strings
  in millisatoshis. The approved destination must be the saved version, not a
  freshly typed address or the branded city-zap forwarding address.
- `mode`: exactly `preflight` or `single-order`. Missing, changed or disabled
  mode prevents a send. Removing the signed approval also prevents new sends.
- `operation.json`: a super-admin-signed kind-30312 operation matching release
  `0.1.2`, the exact wallet, journal, limits, city **and order**. An existing
  broad city grant is insufficient. The review template expires after one hour.
- `wallet-evidence.json`: `{binding, readiness}` using
  `SponsorWalletReadinessEvidence`. Supply fresh independently verified Hub
  inventory and read-probe results; never fabricate successful probes or
  refresh timestamps on old evidence. Lifetime wallet budget and the narrower
  approved test spend are separate limits.
- `deployment.json`: `binding`, journal `serviceId`, `checkedAt`, `expiresAt`,
  and verified `privateTransport`, `separateHost`, `backupRestoreVerified`,
  `exclusiveSender` booleans. Evidence must be at most 60 seconds old.
- `coverage.json`: `RecoveryCoverage`, with the exact live journal `fenceId`,
  full history retained since connection creation, stopped competing senders,
  fresh timestamps and an empty `acceptedPriorSpends`. This runner cannot
  exempt unexplained outgoing payments from reconciliation.
- `nwc-uri` and `journal-token`: owner-only secrets supplied privately, never
  command arguments, chat, Git or archive contents. Only the sponsorship wallet
  credential is loaded; the checkout and zap credentials are not required.

#### Review, preflight and execution

Use `node sponsor-payout-order.cjs --review /absolute/private/config` to validate
the already-settled canonical order and create `unsigned-operation.json`
without wallet access. It refuses to overwrite a prior template. Review the
exact city, order, host destination and amounts, then have the configured
super-admin sign that event with their existing signer and save the signed
result privately as `operation.json`. Do not publish it to a public relay.
The signed event is necessary but does not replace explicit user funding and
payment approval.

With mode `preflight`, `--preflight` loads read access, verifies native Hub fee
safety and reconciles history. It does not request a recipient invoice or
claim/send a payment. Recovery may update an already-paid local obligation
using exact wallet proof; it does not create a debt or mark one paid manually.

Only after reviewed deployment and explicitly bounded user approval, change
mode to `single-order` and use `--send`. It processes only the signed order,
then exits. Output contains redacted states and amounts, never destination,
invoice, credential or preimage. Non-ready/non-paid outcomes exit nonzero.
SIGINT/SIGTERM revoke in-flight send permission, but cannot cancel a payment
already submitted to the wallet.

An exclusive directory lock beside the canonical database prevents overlapping
local runners. A crash can leave the lock behind: verify that no runner is
alive, preserve the database and journal, and review the unknown outcome before
removing that exact stale lock. Never reset attempts, bypass reconciliation or
retry via a manual wallet payment. A fresh process must reconcile first; an
unknown journal claim without complete wallet proof remains blocked.

Acceptance still requires a real staging checkout through the Madeira host's
signed invitation, exact 79/21 read-back, recipient confirmation, a process
restart with no duplicate send, and regression checks on ordinary city zaps and
platform-origin sponsor orders. Local mocked-wallet tests are not that proof.

Local verification: all 342 test files / 2,080 tests pass, including the new
single-order runtime tests and a close/reopen of its file-backed SQLite ledger
after a lost wallet response. Changed-source lint, TypeScript and the bundled
runner build pass. A smoke check confirms the bundle refuses missing private
configuration. The initial sandboxed full-suite run could not open existing
test sockets; the permitted local-socket rerun passed. No service was deployed,
no wallet credential was moved and no invoice or real payment was created.

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

### Source verification — 23 October 2026

The remaining work is not payment authorization alone. Source inspection found
that `run-sponsor-payout-service.ts` accepts only `disabled` mode, and the
`SponsorPayoutFlow`, `SponsorPayoutRecovery` and signed-operation verifier are
not wired into an operational sender entry point. The five focused sender,
flow, recovery, operation and deployment test suites pass (33 tests), but that
is component evidence, not live end-to-end acceptance.

Before funding or enabling anything, assemble and review the operational
adapter with exact settled-order/destination access, signed operation checking,
fresh wallet readiness, off-host reconciliation, bounded execution and safe
shutdown. Then obtain explicit authorization for the selected staging city,
recipient, funding amount, payout and fee limits. Acceptance must record the
79/21 result and restart/no-duplicate evidence. Existing city-zap success does
not satisfy this separate sponsorship rail. BW-92 remains in progress.

### Madeira acceptance preparation — 23 October 2026

The user selected Madeira and its existing confirmed payout address for the
staging test. A funding amount and payment limit have not yet been approved.
Read-only host inspection returned `disabled|none|running`. The installed Hub
safety probe returned `SPONSOR_PAYOUT_REVIEWED_NATIVE_FEE_CAP_VERIFIED` without
creating an invoice, funding a wallet or sending a payment.

The combined flow/recovery rehearsal now exercises the actual local ledger and
journal implementation with a mock wallet: a lost send response leaves the
obligation unknown; recreating the components reconciles complete wallet
history without a second send; incomplete history blocks recovery. This is
in-memory component-recreation evidence, not a process restart or live payment.
All seven focused sponsorship checkout, readiness, sender, flow, recovery,
operation and deployment suites pass (64 tests); changed-test lint passes.

The normal one-walk package is 21,000 sats: 16,590 sats owed to the host and
4,410 sats retained before outgoing fees. The current flow calculates a
165,900-msat (165.9-sat) payout fee ceiling for that obligation. These figures
are not spending approval. Operational wiring, fresh exact destination and
readiness evidence, a signed bounded operation and explicit funding/payment
authorization remain prerequisites for the live test.

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

## Madeira invitation activation candidate

Staging candidate `0.3.394` separates invitation acceptance from payout-sender
activation. Both the global invitation flag and an exact city UUID allowlist
must be valid; otherwise host invitations fail closed while ordinary sponsor
checkout and the super-admin audit remain available. The first deployment
allowlist contains only Madeira (`83f15504-9fca-4d59-a0f6-616a559510df`). The
same scope is rechecked when a private link is previewed and again immediately
before an invoice is created, so an older or forged link for another city
cannot acquire host-payout policy.

The deployment package changes only the staging app release and its two
invitation environment settings. It neither contacts the payout host nor reads,
mounts or enables the sponsor-payout credential. It does not fund a wallet,
authorize a payout operation or send a payment. Successful deployment permits
the Madeira host to create one exact walk invitation and a sponsor to establish
an immutable 79/21 obligation; paying that obligation remains a later,
separately signed and explicitly funded gate. The deterministic candidate bundle
is `bitcoinwalk-madeira-host-sponsor-invitations-0.3.394.tar.gz` with SHA-256
`512905b8a5f012399a63d74275c0bf210181a24a015715250b75bac9f168f2d0`;
the contained app archive has SHA-256
`ed7ecd3847c1ff1083c3435adfdb9a4db9f66bb65078dc0d34daffe092256c9a`.

## Pro eligibility repair

Candidate `0.3.399` fixes the boundary exposed by the Madeira staging test.
The invitation API had required provider-local Rustress queue rows inside the
web-app database, even though those queues belong to the isolated payout
service. A completed Pro city could therefore disappear from the invitation
picker despite its valid entitlement and public addresses.

Eligibility now derives from the canonical settled Pro entitlement, current
signed city owner, exact owner-confirmed payout version, and fresh public
NIP-05 plus LNURL read-back. The feature scope can follow every city that
passes those checks, so a future Pro city becomes available without another
hard-coded UUID. Basic cities, incomplete setup, stale owners, missing payout
versions and failed public read-back still fail closed. The staging installer
atomically mirrors Madeira's already reviewed production entitlement and
payout-authority rows into the isolated staging database; it verifies the
owner signature, makes an online database backup, logs no payout destination,
does not enable the payout sender and cannot send a payment.

The first `0.3.398` wrapper reconciled the rows successfully but its immediate
post-restart health probe raced application startup and restored the preceding
app/feature setting. `0.3.399` retains the atomic, idempotent reconciliation
and adds a bounded startup-health wait before accepting the release.
