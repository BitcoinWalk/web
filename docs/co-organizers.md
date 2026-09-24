# Single-walk delegation — scope correction

App 0.3.14 / relay 0.7.1 replace the mistaken city-wide co-organizer implementation. Staging installation and signed human acceptance are still required.

On /organizer/events, the walk author or super-admin chooses **Delegate this walk**, beside the cancellation control. They nominate an npub and sign an invitation. It is delivered as an encrypted DM; a copyable acceptance link and same-tab delivery retry are available. The colleague reviews the exact date and meeting point and signs acceptance. Pending invitations do not designate the host. Accepted hosts are shown on that event's page and organizer list, with public profile lookup.

This is attendance/hosting delegation ONLY. It grants no city editing, event publishing, cancellation or onward-delegation permission. Existing author/admin cancellation rules remain. Other dates, including the same recurring series, are unaffected. The author/admin can revoke and then invite a replacement. No event is re-signed or moved; its nevent remains unchanged. External NIP-52 clients will still see the original event author; the hosting designation is BitcoinWalk-specific metadata.

## Protocol and migration

- App-specific kind 30305 version 2 binds cityId, exact eventId and nominee, with unique immutable d, city i, event e, nominee p and action tags. Author or super-admin controls it; previousId and increasing timestamps prevent stale changes. One current delegation per walk.
- Kind 30306 version 2 accepts the exact invitation ID and walk ID. Only the named nominee can sign; matching NIP-42 authentication is required.
- Invitations expire at the earlier of seven days or the signed walk end (start for legacy events lacking end). No backdating bypass. Cancellation or city disapproval prevents acceptance. Revoked/replaced invitations cannot be replayed.
- Both publication and storage recheck authority under the existing lock. Records are retained for audit.
- Old version-1 city invitations and acceptances no longer confer city permissions and cannot be newly published. The old team page explains the corrected flow; direct admin-granted city editors are untouched. No history is deleted.
- Hosting records/public keys are public, while the notification is encrypted. No private keys leave the signer's extension.

## Acceptance checklist

1. Original organizer: open a future walk, select Delegate this walk, enter a colleague npub, sign and send.
2. Confirm Awaiting acceptance, receipt of the DM or copied link, and that other dates have no delegation.
3. Nominee: use the named signer, inspect date/meeting point, accept. Wrong identities must be refused.
4. Refresh the organizer list and public event. Confirm the host's name/npub; confirm nominee has no city editor access.
5. Revoke; verify the designation disappears. Reinvite; old acceptance must not activate the replacement.
6. Cancel a pending delegated event, then verify its invitation can no longer be accepted.
7. Confirm existing organizer and super-admin cancellation still works.

Automated checks cover cross-walk and cross-city isolation, authorship, acceptance, revocation, expiry, cancellation, no city access, legacy retirement, storage races and authenticated WebSocket publication. Building/uploading does not sign invitations or alter live permissions.

## Delegate dashboard — app 0.3.15

The user confirmed acceptance via link and revocation on staging. Encrypted DM delivery did not arrive and remains an unresolved, separate issue.

## Armada DM acceptance — app 0.3.19

The nominee's signed kind-10050 inbox list was found on the configured discovery relays and on an Armada default discovery relay. It advertises `wss://auth.nostr1.com`. That relay answers unauthenticated kind-1059 reads with `auth-required: you must auth`. Armada's public source implements NIP-17 DMs and subscribes to the union of its configured DM relays and the identity's published kind-10050 list. This establishes a compatible route, but does not prove that an earlier gift wrap was delivered or displayed.

The delegation panel now links the nominee directly to the organiser's Armada DM conversation. After Send / retry DM, the message states the specific recipient relay(s) that acknowledged the encrypted wrap and its event ID. A sender-copy failure is shown separately; it does not turn a recipient acknowledgement into a failed recipient delivery. A relay acknowledgement is not a read receipt.

Human acceptance: with the organiser signer, retry the pending invitation's DM and record the exact status. With the nominated signer in Armada, open Direct Messages using the panel link, approve NIP-42 relay authentication and NIP-44 decryption if asked, and check whether the message and exact walk acceptance link appear. The invite does not appear in the city chat channel. If the recipient relay did not acknowledge the wrap, use the error in the panel to diagnose publish/authentication. If it acknowledged but Armada remains empty, inspect Armada's DM relay settings and its authenticated inbox connection with the nominee signer.

App 0.3.20 changes only the text of newly prepared hosting DMs. It names the city, formats the signed occurrence in its local time (or explicitly UTC if no time zone is present), includes the exact acceptance link, and directs the nominee to the dashboard with the invited npub. Staging messages use the live staging dashboard URL; production messages use `https://bitcoinwalk.org/admin`. Already published encrypted messages cannot be edited. A new retry prepares a fresh message after this release.

App 0.3.22 replaces that copy with the host invitation requested by the project owner: a city/date/time invitation, the acceptance link, and guidance on welcoming walkers, conversations, privacy, and #ProofOfWalk. The dashboard URL and permission disclaimer are no longer included in the DM. A newly sent message is needed to see the revised wording; previous encrypted messages remain unchanged.

`/organizer/events` now includes **Walks I’m hosting** after connecting the nominee identity. Discovery uses the nominee’s signed acceptance history, then re-reads the exact public event and latest delegation. Revoked, reassigned, cancelled and unpublished walks are excluded on refresh. Current/upcoming dates show local time, meeting point and event link; past hosted dates are available behind a toggle. No city grants or editing/cancellation controls are added. Read failures are shown separately rather than claiming an empty list. Discovery is bounded at 200 acceptance records and fails explicitly if saturated. The invitation page links back to My walks.

Acceptance: connect as a delegate with no city-editor role, confirm the accepted date appears, revoke as the author, refresh as the delegate, confirm disappearance. Test cancellation similarly. This is an app-only upgrade; relay 0.7.1 is unchanged.
