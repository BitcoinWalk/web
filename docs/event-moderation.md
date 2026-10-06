# BW-39: walk visibility and publishing suspension

## First staging increment (app 0.3.89, relay 0.8.56)

Activated on 29 September 2026 after operator relay installation. Relay backup: `/var/backups/bitcoinwalk-relay-moderation-0.8.56.1otPPT`; app backup: `/home/bitcoinwalk/backups/bitcoinwalk-app-bw39-0.3.89.dHUAAi`. App health checks passed. Source commits: web `2b76ec1`, relay `920fa64`.

App 0.3.90 moves the required public-reason field directly into the Publishing suspension section, labels it as applying to the next moderation action, and explains why action buttons remain disabled while it is blank.

The next increment changes organizer suspension from a per-city author decision to an explicit global organizer publishing decision. Relay 0.8.57 treats an existing legacy author suspension as the migration fallback until the super-admin signs a new global decision. App 0.3.91 moves this control to **Admin → Organizers → Publishing access**, disables walk creation and editing for suspended organizers across all centrally managed cities, preserves existing walks and browser drafts, keeps cancellation available, and fails closed when suspension state cannot be verified. Both releases were activated on staging on 29 September 2026. Relay backup: `/var/backups/bitcoinwalk-relay-organizer-global-0.8.57.vktTfZ`; non-root app deployment evidence: `/home/bitcoinwalk/backups/app-staging-deploy.veM30B`. Public and loopback health, all services, and both routes passed after activation. The existing signed Larnaca author suspension `05e10285…97ed2` was read back and is the expected global migration fallback.

Super-admin controls are under **Admin → Walks → Moderation and suspension**. The app checks the relay version before signing; the relay independently checks authority and scope on receipt and again under the storage lock.

- **Hide/unhide** targets the stable `31923:author:d` address. Hiding suppresses anonymous lists, exact-ID reads and broadcasts; edited versions cannot bypass it. Original signed records remain stored. Unhide does not undo cancellation, city disapproval, or other existing read restrictions.
- **Suspend/resume city publishing** blocks new calendar writes for that city without hiding published history or changing ownership.
- **Suspend/resume organizer publishing** applies globally to one public key across all BitcoinWalk cities on the authoritative relay, including protected creators. Resuming does not grant editor permissions.
- Each action requires a nonblank **public** reason and explicit confirmation/signature. Never put private information in the reason.

## Signed protocol

Kind 30310 is reserved here for super-admin moderation. Content is strict JSON with optional `cityId`, `scope` (`event`, `city`, legacy `author`, or global `organizer`), `target`, `status`, `reason`, optional `eventId` (required for event scope), and optional `previous` (the exact current decision ID). Global organizer decisions omit `cityId`; event/city decisions require it. Event statuses are `hidden`/`visible`; publishing statuses are `suspended`/`active`.

Tags are exactly `d=cityId:decisionUUID`, `i=cityId`, `m=scope:target`, `status`, and `client=bitcoinwalk.org`. Unique retained addresses preserve history; the relay rejects changed content at an existing address, stale previous IDs, non-increasing decision timestamps, outsiders, and mismatched event/city/address targets. Retrying the exact stored decision cannot replace a newer state.

## Replication boundary — accepted

Relay 0.8.63 carries exact super-admin-signed event visibility decisions to configured dedicated replicas as ordered `moderation` deliveries. City, author and organizer suspension continue to govern writes at the authoritative source; dedicated city receivers are read-only. The receiver checks the admin signature, city scope, target and predecessor before advancing its durable checkpoint; rejected stale decisions cannot poison that checkpoint. Recovery orders a retained occurrence before its moderation history, reconciliation audits the new journal/outbox records, retry state is durable and sanitized, and visibility remains subordinate to permanent cancellation or city revocation. Automated acceptance covers receiver outage/retry, restart persistence, historical recovery, hide/unhide and non-resurrection after cancellation. Independently operated third-party copies cannot be forcibly removed.

The backup-first source/receiver activation completed on staging on 6 October 2026. The authoritative Memphis source and configured receiver remained exact through activation and restart; backup: `/var/backups/bitcoinwalk-replica-moderation-staging.DATWzP`. The super-admin then completed the signed live hide/unhide exercise and confirmed the configured replica followed the moderation state as expected. Recurring registration and sponsor-logo policy remained active, and the installer created no moderation decision.

## Verification

Automated relay tests cover unauthorized/cross-city actions, exact-ID/broadcast suppression, hidden-address edits, stale decisions, exact replay, hide/unhide, creator and city suspension, preserved public history, cancellation non-resurrection, restart persistence and replication safety gates. Web tests cover signed schema/tag validation, stable addresses, state resolution, version gating and admin tab routing.

Human acceptance for non-replicated cities completed on 6 October 2026. The super-admin temporarily hid the Manchester Bitfest walk; its exact public page became unavailable while unrelated walks remained public. A stale second super-admin tab was rejected, then a freshly loaded decision restored the same event and page without republishing. The Cleveland organizer was globally suspended from **Organizers → Publishing access**: its already-open Walks screen rechecked the current decision and refused publication before signing, a refresh exposed the explicit contact-admin notice and disabled creation/editing controls, existing public content remained visible, and organizer access did not expose super-admin moderation controls. A separately signed resume restored the organizer controls. Earlier acceptance had already confirmed that city suspension blocked relay publication, resume restored it and existing walks remained visible.

The complete non-replicated checklist now passes: event hide/unhide, exact-page restoration, city suspension/resume, global organizer suspension/resume, preserved public history, organizer role denial and stale-state protection. No temporary moderation state was left active.

BW-39 was marked complete after replicated-city activation and signed human acceptance on 6 October 2026. Deployment does not issue moderation decisions; each live decision remains an explicit super-admin signature.
