# BitcoinWalk remote signing transport

`wss://remote.bitcoinwalk.org/` is the dedicated NIP-46 message transport for BitcoinWalk remote-signer connections. It is intentionally separate from the application, event, chat, directory and replica relays.

## Security boundary

- Accept only signed kind `24133` events with exactly one valid `p` recipient tag.
- Relay accepted envelopes only to live matching subscriptions; never create a database or replay history.
- Reject empty or oversized content, invalid signatures, timestamps outside the short acceptance window, broad filters and every other event kind.
- Apply per-IP and global connection, write and subscription limits.
- Listen on `127.0.0.1:3344`; expose it only through Caddy and public TLS.
- Run under a dynamic unprivileged systemd identity with a read-only filesystem view, private temporary directory, no capabilities and bounded memory, tasks and file descriptors.

Recipient filters provide routing rather than authorization. A party that knows a recipient pubkey may observe opaque encrypted envelopes and traffic timing, but cannot decrypt valid NIP-46 content. Clients must still verify and decrypt every message end to end.

## Production topology

- Host: `213.232.235.138`
- Public endpoint: `wss://remote.bitcoinwalk.org/`
- Loopback backend: `127.0.0.1:3344`
- Service: `bitcoinwalk-remote-signer.service`
- Binary: `/opt/bitcoinwalk-remote-signer/bitcoinwalk-remote-signer`
- Persistent state: none

The DNS name must have an explicit `A` record to `213.232.235.138` before activation. The installer validates the existing Caddy configuration, creates a backup, installs the isolated service, obtains public TLS, checks NIP-11 advertisement, proves live kind `24133` delivery and proves the same event is absent from a later subscription.

Amber connections should grant `get_public_key` and `sign_event`; users may choose its remembered/always-allow option for future ngit signatures. The NIP-46 connection secret must not be pasted into tickets, logs, documentation or chat.
