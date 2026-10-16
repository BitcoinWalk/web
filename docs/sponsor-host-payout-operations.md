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
3. native fee-ceiling evidence from the deployed Hub version;
4. encrypted off-host journal backup/restore and complete outgoing-wallet
   history reconciliation after restart;
5. a maximum-seven-day signed operation restricted to reviewed staging cities;
6. an explicitly approved, minimally funded staging payout; and
7. proof that normal city zaps, sponsorship checkout and super-admin sponsor
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
