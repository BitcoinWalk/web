# Personal organizer invitations (BW-27)

The super-admin uses `/admin/invitations` to preview and sign a NIP-17 invitation. Invitations do not grant editor permissions or bypass ordinary city approval. Private keys stay in the user's signer.

## Inbox discovery

Release 0.3.87 searches the configured profile relays plus Ditto and Primal for signed kind-10050 inbox announcements. A build-time `NEXT_PUBLIC_INBOX_DISCOVERY_RELAYS` comma-separated list can override these discovery servers. Discovery servers are not fallback message destinations: delivery uses only each account's latest valid signed inbox announcement, with up to three distinct public WSS destinations.

Reads run independently with bounded timeouts; failed relays do not hide records from completed reads. Errors distinguish network failure, missing announcements, unusable destinations, and the sender-copy versus recipient account. A failed preview explicitly says no invitation was sent.

On 2026-09-29, read-only live verification of the corrected discovery function found the Norilsk organizer's existing inbox list (Ditto, nos.lol, Damus) and the super-admin's existing list (auth.nostr1.com, relay.keychat.io, Ditto). Earlier Damus/nos.lol-only discovery had returned no record or timed out. No inbox reconfiguration was necessary, and this verification sent no invitations.

## Acceptance — completed 29 September 2026

The user confirmed recipient delivery in Armada, the sender's conversation copy, and the working registration link on staging 0.3.87, and authorized closing BW-27. The invitation is sent by the super-admin account, not BitcoinWalk Guide. For unfamiliar senders, check Armada's Message requests and ensure recipient relay authentication is approved.

Repeatable verification steps:

1. Hard-refresh the staging invitations page, connect the super-admin, enter the recipient's public npub, and preview.
2. Check the recipient, registration URL, message, and both relay lists. Confirm sending and approve signer requests.
3. Confirm the recipient can decrypt the invitation in a NIP-17-compatible client.
4. Confirm the sender can see their sent copy and the registration link opens the intended public form.

Relay acknowledgement alone does not prove recipient decryption. On partial delivery, retry reuses already signed envelopes and completes only the outstanding copy. Human acceptance has passed; BW-27 is done.
