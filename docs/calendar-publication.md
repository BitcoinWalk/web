# Calendar publication staging acceptance — 19 September 2026

At this 19 September acceptance snapshot, relay policy 0.4.0 was installed on relay-staging.bitcoinwalk.org. The relay advertised 0.6.0 in a read-only check on 21 September; see [the current backlog](project-backlog.md) for the organizer occurrence release boundary. User-reported protected backup: `/var/backups/bitcoinwalk-calendar.jWh5AU`. Local web publication controls are active at http://localhost:3000/admin/calendar. No real calendar event was signed or published by the agent.

## Human acceptance

1. Select the BitcoinWalk super-admin in the browser extension.
2. Open `/admin/calendar` and click **Connect and load approved walks**.
3. Choose one approved test city, check date/time and meeting point, then click **Sign and publish calendar event**. Confirm the destination and sign/authenticate in the extension.
4. Expect **Published and read back**. If acknowledgement is uncertain, reload before retrying; an existing matching publication is reused.
5. Open the generated event link. Confirm the city, exact approved description, time and coordinates. The ordinary city page should also offer its event link.
6. Reload the calendar list and confirm the existing publication is shown without requiring another signature.

Negative approval/revocation cases have automated coverage; staging human rescheduling/revocation acceptance remains. Discovery in Satlantis/Club Orange has not been verified. Publishing on our relay does not guarantee those clients subscribe to it.

## Scope and limitations

- One current scheduled event address per city, kind 31923. No recurring-event series or occurrence archive yet.
- Only the exact current approved revision and approval are accepted. Pending edits do not replace the approved snapshot.
- Rescheduling replaces the calendar event. An old nevent ID can become unavailable; it is never silently replaced by another event under the old link.
- Revoked/stale events are filtered on our relay reads. Already fetched third-party copies cannot be recalled by this policy; cancellation/deletion propagation remains future work.
- Links currently use the local web origin. Production hostname and paid subdomain rollout are separate work.
- Untrusted nevent relay hints are not fetched by the web server.
- This slice changes no chat service, DNS, Caddy, relay credentials or legacy website.

Verification: 80 web tests passed, TypeScript and production build passed, changed-file lint has no errors (one existing hero-image warning), and browser inspection confirmed the initial unsigned admin page. The human signed workflow is still pending.
