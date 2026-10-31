# BW-112 — Guide reminders for cities without scheduled walks

Status: app controls deployed to staging 0.3.600 (31 October 2026); no reminder job or messages enabled.

## Implemented pilot and rollout gate

The app exposes a signed, Guide/super-admin-only `/api/guide-reminders` snapshot.
Current owners can read and change private on/off and 30/90-day snooze settings
from **My cities → Guide reminders**. Ownership is re-read for every request;
editors and former owners are refused. Settings use optimistic versions so an
old signed request cannot undo a newer preference. The app-wide operator pause
is `BITCOINWALK_IDLE_REMINDERS_ENABLED` (off unless exactly `true`).

The standalone `src/guide/idle-runner.ts` reuses the existing encrypted outbox
and transport helpers, but keeps `guide-idle.sqlite` separate from lifecycle
deliveries so the lifecycle worker cannot bypass reminder-specific rechecks.
It binds state to the Guide key, source relay and environment's admin URL.
Daily scans require complete directory, permission, moderation and calendar
reads; saturated or failed reads cannot establish inactivity. Active walks and
the existing one-hour walk grace period suppress reminders too.

Build with `npm run guide:idle:build`. Use the reviewed Guide configuration plus
`idleEnabled: false` and `idleRecipients: []` initially. Delivery requires both
the app-wide flag and `idleEnabled: true`, and only exact hex public keys in
`idleRecipients` are eligible. Keep staging and production config/state separate.
The endpoint is the existing environment's loopback app port (3338 staging,
3345 production), never a user-provided URL.

The runner's `--dry-run` reports aggregate eligibility only. It signs a private
read request but writes no reminder observation, outbox or delivery state. The
app may initialize its empty preference table. `--once` observes/queues and
rechecks the full snapshot immediately before encrypted delivery. No runtime
clock override exists; controlled clocks are test-only. A missed daily scan or
failed snapshot restarts the seven-day observation, retaining the message cap.
Transport retries retain the exact encrypted event; uncertain deliveries consume
the two-message budget even if later cancelled, to avoid duplicate nudges.

Disabled service/timer templates are in `deploy/guide/bitcoinwalk-guide-idle.*`.
Before installation, verify the target's Node path, credential access and separate
private state directory; run the scanner under the supplied non-overlap lock.
The timer uses 10:15 UTC; systemd journal rotation handles aggregate logs. The
scanner is independent of other Guide scan failures. Do not enable the timer
until a willing staging organizer confirms receipt and the dashboard link.

Before rollout, back up the app payment database (private preferences) and the
idle worker SQLite database with SQLite's online backup API; verify the copies
with `PRAGMA integrity_check`. Retain the previous bundle/config. Rollback:
disable the timer and service, turn off the app flag and `idleEnabled`, restore
the previous bundle only, and retain the live outbox/cooldown state. Do not restore
an older delivery database merely to retry a deployment: it can replay messages.

The user nominated Chlef for the staging pilot on 31 October 2026. Its current
controlling organizer was resolved from verified staging approval and ownership
records; no public city-profile identity was substituted and no message was sent.
The merged implementation passes 398 test files / 2,399 tests, type checking,
the application build and lint (zero errors; eight existing warnings).

Still required: signed-in staging UI acceptance, an allow-listed organizer's real
NIP-17 receipt, packaged service installation/backup rehearsal, and a reviewed
production dry run. App staging deployment is accepted; no worker installation or real reminder has been performed. Production is unchanged.

## Communication

Purpose: help organizers keep their approved city's calendar populated. Both Basic
and Pro cities qualify. An empty calendar does not change approval or entitlement.

Recommended cadence: check daily; first nudge after seven consecutive days without
an active or upcoming public walk; one follow-up fourteen days after that nudge.
Then pause until the organizer schedules a walk and a new idle period begins.
Existing empty cities start their seven-day observation period at activation.
Newly approved cities get the same grace period. Do not send a launch-day backlog.

First message:

> Hi! There aren't any upcoming walks listed for BitcoinWalk in {city} at the moment. Ready to get your community walking again? Add your next walk here: https://bitcoinwalk.org/admin/walks
>
> You can schedule several dates together to keep your calendar ready. If you're taking a break, that's fine too—snooze these reminders in your dashboard.
>
> BitcoinWalk Guide is automated; replies aren't monitored.

Follow-up:

> A friendly reminder: BitcoinWalk in {city} is still waiting for its next walk. When you're ready, add a date here: https://bitcoinwalk.org/admin/walks
>
> We'll pause reminders after this one until you schedule another walk. You can also manage reminders in your dashboard.
>
> BitcoinWalk Guide is automated; replies aren't monitored.

Group multiple eligible cities for the same organizer into one message with city
names and the same dashboard link. Apply a global fourteen-day reminder cooldown
per recipient, including across cities; only included cities advance their stage.
Keep the message's snooze language gated on the preference UI actually shipping.

## Eligibility and scheduling

Use the same verified approval and occurrence rules as the homepage. No active or
upcoming published occurrence means an empty schedule; browser-only drafts cannot
be inspected and do not count as published walks. Suppress archived, disapproved,
publishing-suspended cities and suspended organizers. Resolve the current private
controlling organizer through verified ownership/authorization, including city
identity migrations. Never assume the public branded Hosted-by npub is the login
owner, and do not notify editors, former owners or gift purchasers.

Daily cron proposal, executed as the existing unprivileged Guide service account
on the app VPS, using that host's documented UTC timezone:

```cron
15 10 * * * /usr/bin/flock -n /var/lib/bitcoinwalk-guide/idle-scan.lock /opt/bitcoinwalk-guide/bin/scan-idle-organizers >> /var/log/bitcoinwalk-guide/idle-scan.log 2>&1
```

Paths above are proposed, to be reconciled with the installed Guide user/runtime
before packaging. Provision writable state/log directories once; rotate logs.
The wrapper uses the pinned Node runtime and a bounded one-shot scan command.
Cron only evaluates eligibility and queues due reminders; the existing Guide
worker handles encrypted delivery and retry. Do not run a second unrestricted
message sender or create any user-key signing automation.

Run once daily at 10:15 UTC initially. Recipient-local quiet hours can follow when
a trustworthy timezone preference exists. A missed cron run is caught up by the
next run from durable due timestamps, without replaying missed daily messages.

## Implementation stages

1. Add a complete production snapshot reader over the private relay, reusing signed
   city, authorization, occurrence and moderation validation. A failed, partial,
   timed-out or saturated read must never imply an empty calendar. Expose a dry-run
   report with eligible, suppressed and unavailable counts; no private keys or DM
   content in logs. Keep staging data and delivery destinations isolated.
2. Add durable SQLite state: environment, city ID, recipient, idle-period ID,
   first-observed-empty time, last valid snapshot, next-due time, reminder stage,
   delivery ID and preference version. Reset eligibility on a scheduled occurrence;
   invalidate pending messages on ownership change, moderation or scheduling. Reset
   the seven-day observation after an unverified scan gap so outages cannot prove
   continuous inactivity. Use a unique queue key and transactional claim for every
   recipient/idle-period/stage, plus the recipient cooldown.
3. Add owner-authenticated reminder controls in My cities: on/off and snooze for
   30/90 days. Default on for this limited two-message cycle; allow super-admin
   global pause. Preferences are checked again immediately before each delivery.
4. Add the Guide notification type and grouped copy above. Reuse verified NIP-17
   inbox discovery, the existing relay allow-list and durable encrypted envelopes.
   Retry the identical envelope after uncertainty or restart. Relay acknowledgement
   means accepted by the relay, not read by the organizer. Missing inboxes appear
   as needs-attention operational status; never fall back to public messages.
5. Package the one-shot scanner and disabled cron entry, with a runtime flag,
   bounded execution, overlap lock, rotating sanitized logs and daily health
   evidence. Evaluate reminders independently of unrelated Guide scan failures.
   Back up the notification DB and retain rollback instructions.
6. Test with a controlled staging clock and allow-listed organizer: 7-day initial
   grace, 14-day follow-up, two-message cap, grouped cities, owner change, snooze,
   opt-out, archive, suspension, a newly scheduled walk, incomplete relay reads,
   simultaneous scans, restart and uncertain delivery. Confirm real DM receipt
   and the dashboard link. Run a production dry run for the current city inventory,
   then enable the production schedule after review. No test changes to real dates.

## Completion criteria

The intended organizer receives one friendly reminder with the exact production
dashboard URL after the grace period, and at most one follow-up for that idle
period. Scheduling, snoozing or opting out cancels queued reminders. Restarts and
cron overlap never create duplicate messages. Existing approval, payout, identity
and calendar records remain unchanged. Operations can inspect last scan, next due,
delivery acknowledgement and failures without reading private messages.
