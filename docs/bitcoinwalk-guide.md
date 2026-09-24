# BitcoinWalk Guide — notification-only staging pilot

Status: the [backlog](project-backlog.md) reports that the notification worker is
installed on staging, its VPS bot key was generated, a real encrypted approval DM
arrived in Armada, and the public bot profile was published. Display-name refresh,
exact review-link behavior, restart deduplication and mobile push remain acceptance
items. The initial dry run on 20 September 2026 succeeded against the organizer
staging relay and the super-admin's advertised inbox list.

## Identity and scope

- Display name: BitcoinWalk Guide; metadata marks it as a bot.
- Dedicated key generated **on the VPS**, never in the frontend, logs or chat.
- `guide@bitcoinwalk.org` is reserved as a proposal, NOT a verified NIP-05 claim.
  Add it only after the legacy domain's well-known endpoint is reviewed and
  configured for the generated public key. No legacy website changes in this package.
- Notifications only. No AI replies, approvals, relay management, payments, or
  privileges inferred from the recipient list. Existing approval authority is unchanged.
- Initial recipient is the existing BitcoinWalk super-admin. More recipient
  hex pubkeys can be explicitly configured without granting them admin powers.

## How it works

A separate Node 24 worker polls the accepted, retained city-revision history and
admin decisions on the configured relay every minute. It uses the same signature,
schema and pending-revision rules as the admin page. Full bounded reads avoid
losing late submissions with old author-selected timestamps. Truncated, saturated
or failed reads do not advance the baseline. Scaling beyond 20,000 records needs
an ingestion-sequence feed; the worker fails closed at its scan limit.

The **first successful live scan silently baselines existing records**. It does
not DM old pending submissions. Submit a fresh test revision after startup for
acceptance. Existing pending work stays visible in `/admin`.

Each subsequent undecided revision is queued once per configured recipient.
For the new-city workflow, an approval that releases a verified organizer-signed
first walk also queues one encrypted live-link message to that organizer. The
worker only calls the walk live after the exact approval-bound NIP-52 event is
readable from the managed relay. Review and live messages have separate durable
deduplication/retry state; revocation or loss of public eligibility suppresses a
queued live notification.
SQLite commits the queue and seen IDs together. Gift-wrap events are encrypted
before storage; a separately encrypted sender copy is retained locally, not
published to an invented bot inbox. Failed deliveries retry with exponential
backoff up to one hour, using exactly the same signed wrapper ID across restarts.
One inbox-relay acknowledgement completes a delivery; it is NOT a read receipt.
Decided submissions and removed recipients are suppressed before retry. Decisions
are checked again immediately before publishing, but an admin can still act
between that check and delivery; alerts explicitly say status may have changed.

NIP-17 kind-10050 inbox lists are signature-checked and rediscovered on retry.
Destinations must also be in the operator-reviewed allowlist. No public-note,
plaintext or NIP-04 fallback. Recipient inbox changes to a new host require
configuration review. NIP-42 transport authentication uses only the bot key.

For the configured super-admin, the discovery result advertised:
`wss://auth.nostr1.com/`, `wss://relay.keychat.io/`, `wss://relay.ditto.pub/`.
Discovery relays are `wss://relay.damus.io/` and `wss://nos.lol/`.
That initial discovery confirmed routing configuration; the later Armada DM
confirmed one delivery, while mobile push remains unverified.

## Package installation (historical procedure; review before reuse)

The package requires the already-installed app-private Node runtime at
`/opt/bitcoinwalk-app-staging/runtime/bin/node`. It opens no listening port and
changes no Caddy, DNS, relays, databases or legacy services.

```sh
cd /home/bitcoinwalk/bitcoinwalk-guide-staging
sudo sh deploy/install-guide.sh
```

The installer refuses an existing Guide installation. It generates a new
root-owned 0600 key without printing it, and installs a disabled configuration
and an unstarted systemd unit. An interrupted installation requires review;
do not remove the key or rerun blindly. Securely back up
`/etc/bitcoinwalk-guide/guide-key` outside the VPS before enabling. Never paste it
into chat. After startup, also back up the SQLite state consistently (SQLite
backup API or stop service before copying database and WAL together).

Review `/etc/bitcoinwalk-guide/config.json`, then perform the non-mutating check:

```sh
sudo env GUIDE_CONFIG=/etc/bitcoinwalk-guide/config.json /opt/bitcoinwalk-app-staging/runtime/bin/node /opt/bitcoinwalk-guide/guide.cjs --dry-run
```

Publish **only the bot's public profile** as an explicit, separate action:

```sh
sudo systemd-run --unit=bitcoinwalk-guide-profile --wait --pipe --collect \
  -p DynamicUser=yes -p StateDirectory=bitcoinwalk-guide -p StateDirectoryMode=0700 \
  -p LoadCredential=guide-key:/etc/bitcoinwalk-guide/guide-key \
  -p Environment=GUIDE_CONFIG=/etc/bitcoinwalk-guide/config.json \
  /opt/bitcoinwalk-app-staging/runtime/bin/node /opt/bitcoinwalk-guide/guide.cjs --publish-profile
```

Set `enabled` to `true` using `sudoedit /etc/bitcoinwalk-guide/config.json`, then:

```sh
sudo systemctl enable --now bitcoinwalk-guide
sudo journalctl -u bitcoinwalk-guide --no-pager -n 30
```

Wait for the first `Scan complete` line (the baseline). Then submit a fresh test
walk/revision. Verify its alert in Armada on desktop and mobile as the super-admin.
The bot may initially appear under message requests. Enable device/app notifications
as desired; BitcoinWalk cannot guarantee push popups. Check the sender's npub
against the public identity printed by the installer.

Click Review, connect the super-admin signer, and load submissions. Web code
scrolls to the matching revision using `#submission-<id>`; verify the deployed
version before relying on that behavior. The message includes the full City ID
and revision for manual matching.
No signature is requested by opening a link. A completed request can be absent
from the pending list; the link itself never grants approval authority.

Acceptance: one alert per recipient; decryptable DM; accurate city/tier; correct
review link; no duplicates after a worker restart; decision stops queued retries;
regular recipient cannot approve; inbox failures do not block submission. For a
fresh new city, approval must publish its exact organizer-signed first walk, and
Guide must send the organizer that walk's memorable URL once publication is verified.

## Operations and rollback

```sh
sudo systemctl status bitcoinwalk-guide --no-pager
sudo journalctl -u bitcoinwalk-guide --since '10 minutes ago' --no-pager
sudo systemctl disable --now bitcoinwalk-guide
```

Stopping leaves the key and queue recoverable. Do not delete the state database
to troubleshoot: it contains the deduplication baseline and encrypted sender copies.
The queue stores recipient pubkeys and submission IDs as routing metadata, so keep
its systemd state directory private. Logs avoid message bodies and credentials.
Do not add moderator or owner powers to Guide. Future AI support must treat both
DMs and submitted text as untrusted and keep sensitive actions behind human signing.

## Development

`npm run guide:build` builds the server-only worker and key initializer. `npm test`
covers encryption, inbox validation, retries, restart deduplication and identity
separation. Nothing under `src/guide` is imported by a client component. `enabled`
defaults false. Dry run does not load a key, mutate SQLite or publish any event.
