# City editor management — 19 September 2026

Local URL: http://localhost:3000/admin/editors (linked from `/admin`).

Only the super-admin may sign add/remove operations. Enter public npubs; no hex,
nsec or other Nostr identifier is accepted by the add field. Each operation has
an explicit confirmation including city UUID and full target npub. The creator
cannot be removed/reassigned; implicit super-admin access is protected. Other
editors and immutable creator/revision fields are preserved. Maximum 100 listed
editors, matching the relay schema. No chat membership or approval is changed.

The app reloads the exact city authorization from write relays before and after
the signing prompt. Missing/changed records abort the operation. It checks the
returned signed payload/account before publishing, requires a relay ACK, and
reads the exact resulting authorization back before showing verified success.
An acknowledged update with unconfirmed read-back requires reload, not blind retry.
Production signature verification and permission enforcement remain in the relay.

Concurrency limitation: these are best-effort stale-read checks, not atomic
compare-and-swap. Avoid simultaneous admin sessions. Relay timestamp monotonicity
and creator immutability remain enforced. Initial global city discovery remains
bounded; the UI does not treat an empty result as proof of absence. Read-failure
reporting and robust multi-relay reconciliation remain broader backlog items.

## Verification

58 web tests, TypeScript and changed-code lint pass. Browser initial page verified.
No real permission changes were performed. Existing relay permission tests cover
city isolation and revocation; this new UI still needs human signer acceptance.
No new VPS install is needed: organizer 0.3.0 already supports authorization updates.

## Human acceptance

1. Select the super-admin account, load city editors, and select the exact city UUID.
2. Add a second account's npub; confirm the change, sign and authenticate as prompted.
3. In a separate browser/profile or after switching signer and reconnecting, open
   `/organizer` with that account. Confirm access to this city, not another city
   where the account has no grant. Submit an edit if desired; it still needs approval.
4. Return to super-admin, reload editor management, remove the second account.
5. Reconnect/reload the second account in `/organizer`: the city should disappear.
   A stale form must fail its permission recheck; the relay independently rejects
   fresh edits from removed editors. Creator access remains unchanged.

User reported the preceding organizer edit flow works; do not infer from that
report that every rejection/revocation edge case was manually exercised.
