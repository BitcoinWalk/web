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
