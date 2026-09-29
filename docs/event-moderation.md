# BW-39: walk visibility and publishing suspension

## First staging increment (app 0.3.89, relay 0.8.56)

Activated on 29 September 2026 after operator relay installation. Relay backup: `/var/backups/bitcoinwalk-relay-moderation-0.8.56.1otPPT`; app backup: `/home/bitcoinwalk/backups/bitcoinwalk-app-bw39-0.3.89.dHUAAi`. App health checks passed. Source commits: web `2b76ec1`, relay `920fa64`. Signed human acceptance is still pending.

Super-admin controls are under **Admin → Cities → Walk moderation**. They apply to non-replicated cities only. The app checks the relay version before signing; the relay independently checks authority and scope on receipt and again under the storage lock.

- **Hide/unhide** targets the stable `31923:author:d` address. Hiding suppresses anonymous lists, exact-ID reads and broadcasts; edited versions cannot bypass it. Original signed records remain stored. Unhide does not undo cancellation, city disapproval, or other existing read restrictions.
- **Suspend/resume city publishing** blocks new calendar writes for that city without hiding published history or changing ownership.
- **Suspend/resume organizer publishing** applies to one public key in one city, including its protected creator. It is not a global account ban. Resuming does not grant editor permissions.
- Each action requires a nonblank **public** reason and explicit confirmation/signature. Never put private information in the reason.

## Signed protocol

Kind 30310 is reserved here for super-admin moderation. Content is strict JSON with `cityId`, `scope` (`event`, `city`, `author`), `target`, `status`, `reason`, optional `eventId` (required for event scope), and optional `previous` (the exact current decision ID). Event statuses are `hidden`/`visible`; publishing statuses are `suspended`/`active`.

Tags are exactly `d=cityId:decisionUUID`, `i=cityId`, `m=scope:target`, `status`, and `client=bitcoinwalk.org`. Unique retained addresses preserve history; the relay rejects changed content at an existing address, stale previous IDs, non-increasing decision timestamps, outsiders, and mismatched event/city/address targets. Retrying the exact stored decision cannot replace a newer state.

## Replication boundary — still outstanding

This release deliberately rejects moderation for cities in the source's replication registry. It also rejects exporting a moderated city or adding its history to replication recovery. Receiver transport, suppression/unhide ordering, state reconciliation and restart acceptance must be implemented before enabling these controls for replicated cities. It would be unsafe to report success while a dedicated relay still exposes a hidden walk. Independently operated third-party copies cannot be forcibly removed.

## Verification

Automated relay tests cover unauthorized/cross-city actions, exact-ID/broadcast suppression, hidden-address edits, stale decisions, exact replay, hide/unhide, creator and city suspension, preserved public history, cancellation non-resurrection, restart persistence and replication safety gates. Web tests cover signed schema/tag validation, stable addresses, state resolution, version gating and admin tab routing.

Human staging acceptance remains pending. After the operator installs relay 0.8.56, use a non-replicated test city:

1. Hide one walk with a test reason. Verify its exact public link is unavailable and other walks remain public.
2. Unhide it with another reason. Verify the original event ID/page returns, without republishing.
3. Suspend the creator. Attempt a new publication as that creator: relay rejection is required; older walks remain visible.
4. Resume the creator and verify normal authorized publication works. Repeat city-level suspension.
5. Verify organizer access is denied and stale super-admin tabs cannot overwrite a newer decision.

Do not mark BW-39 done until replication support and human acceptance are complete. No live moderation decisions are issued by the deployment process.
