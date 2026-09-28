# Organizer staging integration — retained revisions

Local app reads/writes `wss://relay-staging.bitcoinwalk.org`. Retained-history browser acceptance completed on 29 September 2026 with relay `bitcoinwalk-organizers-0.8.53` and app `app-staging-0.3.81`. Relay rollback backup: `/var/backups/bitcoinwalk-relay-bw08-0.8.53.UFIuaJ`; app rollback backup: `/home/bitcoinwalk/backups/bitcoinwalk-app-bw08-0.3.81.E6eWlI`. DNS, chat, legacy services and signed record contents were not changed. Staging proposals and released walks are publicly readable.

## Implemented

- Existing `/start` signs and submits new proposals, showing the destination and public-data warning.
- `/admin` checks the selected super-admin identity, displays city UUID and organizer key, and registers the creator with a kind-30302 grant before approving a new city. Each step requires a user signature and relay acknowledgement. Rejection does not register a creator.
- Existing grants are reused; their creator/editor list is never overwritten by this approval flow. Unauthorized authors are refused. Partial completion is explicit: if registration succeeds but approval fails, the grant remains for a retry.
- Signed grant parsing checks administrator identity and city tag; city/decision parsers check their content/tag bindings.
- Each new revision and decision uses its own cityUUID:randomUUID address. The relay blocks replacement, retaining the previous approved snapshot. Legacy addresses remain readable.
- Public rendering selects the exact approved revision; pending edits and rejection of another revision leave it visible. Revocation hides the city until a later approval. Missing selected content does not fall back to an older version.
- Public lookup pages city-scoped decision history and retrieves approved snapshots by ID, rather than relying on the newest draft query page. The regression suite includes more than 200 newer edits/decisions.
- The accepted releases pass 337 web tests, production build and package smoke, plus 115 relay tests, 22 deployment verifiers, race detection and static analysis.

## Initial approval acceptance

1. Select a regular organizer identity in the extension. At `/start`, submit a distinct test city, for example `Organizer Pilot`. Do not reuse a real city's name.
2. Select the BitcoinWalk super-admin identity, reopen `/admin`, then load pending proposals.
3. Inspect city UUID/organizer and any duplicate city names; click Register creator and approve. Approve grant, decision and relay-authentication prompts as needed.
4. Open the approved city's link without a signer. The user confirmed initial approval succeeded. No existing Radom record is migrated from the legacy relay.

## Retained-history acceptance (completed 29 September 2026)

Norilsk revision A was public before and while organizer-signed revision B awaited review. The super-admin rejected B and A remained public. The organizer replaced only the test suffix and signed revision C; the super-admin approved C, making it the current city profile while retaining A, B and all three signed decisions. Because the first walk is an immutable signed occurrence, its original description remains unchanged; later city-profile edits affect defaults for future events rather than rewriting that signature. The test exposed a relay and web resolver bug that temporarily hid the first walk after C approval. Relay `0.8.53` and app `0.3.81` fixed the retained release linkage. Anonymous `/norilsk` again redirects to the exact valid `nevent` page.

## Still to verify

- Human editor grant/removal and cross-account acceptance. Organizer content editing is available at `/organizer`, and editor management is implemented locally. Previously overwritten pre-upgrade records cannot be recovered automatically.
- City-name uniqueness, pagination beyond the initial 500 records, and stronger read-failure reporting remain separate work.
- Production relay/app migration remains separate. No automatic calendar publication was added.
- Paid provisioning remains separate. See [the current backlog](project-backlog.md) for later moderation and chat status.
