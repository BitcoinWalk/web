# Organizer staging integration — retained revisions

Local app reads/writes `wss://relay-staging.bitcoinwalk.org` (organizer mode 0.3.0 was verified on 19 September 2026; the relay advertised 0.6.0 on 21 September). The user installed the retained-history upgrade; protected backup: `/var/backups/bitcoinwalk-approved-revisions.rr06ol`. The matching web changes are activated locally. DNS, chat, legacy services and existing signed records were not changed. Staging proposals are publicly readable.

## Implemented

- Existing `/start` signs and submits new proposals, showing the destination and public-data warning.
- `/admin` checks the selected super-admin identity, displays city UUID and organizer key, and registers the creator with a kind-30302 grant before approving a new city. Each step requires a user signature and relay acknowledgement. Rejection does not register a creator.
- Existing grants are reused; their creator/editor list is never overwritten by this approval flow. Unauthorized authors are refused. Partial completion is explicit: if registration succeeds but approval fails, the grant remains for a retry.
- Signed grant parsing checks administrator identity and city tag; city/decision parsers check their content/tag bindings.
- Each new revision and decision uses its own cityUUID:randomUUID address. The relay blocks replacement, retaining the previous approved snapshot. Legacy addresses remain readable.
- Public rendering selects the exact approved revision; pending edits and rejection of another revision leave it visible. Revocation hides the city until a later approval. Missing selected content does not fall back to an older version.
- Public lookup pages city-scoped decision history and retrieves approved snapshots by ID, rather than relying on the newest draft query page. The regression suite includes more than 200 newer edits/decisions.
- 43 web tests and TypeScript pass in the prepared app; relay race suite passes twice. Initial approval was confirmed by the user; retained-history browser/signing acceptance remains pending.

## Initial approval acceptance

1. Select a regular organizer identity in the extension. At `/start`, submit a distinct test city, for example `Organizer Pilot`. Do not reuse a real city's name.
2. Select the BitcoinWalk super-admin identity, reopen `/admin`, then load pending proposals.
3. Inspect city UUID/organizer and any duplicate city names; click Register creator and approve. Approve grant, decision and relay-authentication prompts as needed.
4. Open the approved city's link without a signer. The user confirmed initial approval succeeded. No existing Radom record is migrated from the legacy relay.

## Retained-history acceptance (pending)

Approve revision A; use `/organizer` to submit edit B; verify A remains public. Reject B; verify A remains public. Approve edit C; verify C appears. These actions require human signatures; `/start` creates a new city, not an edit. Do not claim this test has passed on the VPS yet. See `organizer-editor.md` for the full test sequence. The editor and expanded review are locally active; 51 tests, TypeScript and changed-code lint pass.

## Still to verify

- Human editor grant/removal and retained-history acceptance. Organizer content editing is available at `/organizer`, and editor management is implemented locally. Previously overwritten pre-upgrade records cannot be recovered automatically.
- City-name uniqueness, pagination beyond the initial 500 records, and stronger read-failure reporting remain separate work.
- The relay now advertises 0.6.0 with organizer occurrence policy markers. Organizer web publication is still awaiting release and signed acceptance; no automatic calendar publication was added.
- Browser-signing acceptance has not been automated or claimed. Paid provisioning and production migration remain separate work. See [the current backlog](project-backlog.md) for later moderation and chat status.
