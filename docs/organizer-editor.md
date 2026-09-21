# Organizer editor — local staging slice, 19 September 2026

URL: http://localhost:3000/organizer

Connect a browser extension, load registered walks, and select a city. The creator,
current whitelisted editors and super-admin are eligible. Latest signed grants
are used; unregistered cities and unauthorized candidate revisions are excluded.
The form starts from the newest available revision by a currently authorized
author, not necessarily the published revision. Its decision status and event ID
are shown. Existing bounded global discovery reads remain a pilot limitation.

Editable: date/time in device timezone, description, map pin, meeting description,
hero URL. Preserved: city UUID/name/slug, chat URL and sponsorship. No editor-list
mutation, uploads, payments or production migration is included in this slice.

Before signing, the app rechecks account, permission and the latest available
revision; a changed head requires reload. This is a best-effort stale-form check,
not a server-side atomic conflict lock. Concurrent signed proposals can coexist.
The relay still enforces actual permission at storage time. Edits have a new
immutable address and reference their base revision. An ACK is required before
showing success. No automatic approval, unsigned edits or private-key handling.

Admin review now displays revision/base IDs, description, image URL and meeting
pin. Public pages display the approved description. Existing map behavior for
new walks remains unchanged; editing locks the city lookup but permits pin moves.

## Verification

- 51 unit/regression tests pass, including permission revocation, city isolation,
  unauthorized revisions, preservation of identity/chat/sponsor, date handling,
  retained approved snapshots and rejection/revocation behavior.
- TypeScript and changed-code lint pass.
- Local `/organizer` and `/admin` return HTTP 200; browser initial page verified.
- No real signatures or test writes performed by the agent. Human acceptance pending.

## Human acceptance

1. Sign in with the creator or an authorized editor at `/organizer`. Load/select
   an already approved walk. Open its public page in a separate tab.
2. Change a recognizable phrase in the description or meeting-point text and
   submit. Approve extension signing and relay authentication prompts.
3. Reload the public page: it should still show the previously approved wording.
4. Use the super-admin at `/admin`, load submissions, inspect this exact revision
   and reject it. Reload the public page: old wording should remain.
5. Return to the organizer identity, reload the editor, submit another edit.
   Approve that exact revision as super-admin; reload the public page and confirm
   the newly approved wording appears.

Switching extension accounts requires reconnecting/reloading the organizer page.
Do not use `/start` for an edit: it creates a different city UUID.
