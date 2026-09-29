# City editor management — 19 September 2026

Current staging URL: https://app-staging.bitcoinwalk.org/admin/cities?tab=editors
(Cities → Editors). The legacy `/admin/editors` route redirects to the unified dashboard.

## BW-11 acceptance review — 29 September 2026

Staging health reports `app-staging-0.3.83`. The four focused suites for editor
management, organizer editing, organizer integration and city-tab routing pass
(23 tests). The creator edit/reject/reapprove flow was accepted under BW-08.
BW-11 still needs a real second identity's grant, city-scoped access and removal
acceptance. Health and automated tests do not establish this signer-driven result.

Choose one staging city and a second identity that is neither its creator nor
the super-admin, and does not already hold an editor grant for that city. Record
the original editor list before testing. Add only that identity; after verification,
remove only the test grant. Retain any test revision in the normal review history.
Use an unrelated city where the second identity has no grant as the isolation check.
Keep the second identity's edit form open during removal so that submitting the
stale form exercises the permission recheck. Then reload to confirm access is gone.
Creator and super-admin access must remain, and the approved public page must
remain unchanged while a test revision is pending or rejected.

Human acceptance: the user confirmed adding Norilsk's second editor,
then submission of revision `0b878751153ade89d380e64818430f10b125da4dbd01e0cb68089a594686cd0c`
to one relay. The public page retained its previous description. The user then
confirmed rejection worked and explicitly accepted BW-11 as complete. Removal,
stale-form rejection and cross-city isolation were not individually reported;
retain those checks for production revalidation under BW-53. This test also exposed a
first-event hero fallback regression: the original approval retained a working
managed image, while the newer BW-08 profile approval had no image. App `0.3.84`
adds the verified first-release image after current hero sources; it does not
change signed events or approve the pending editor revision.

The following implementation and initial verification notes are historical.

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
