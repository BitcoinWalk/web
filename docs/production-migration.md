# BitcoinWalk production migration, backups and rollback

Prepared 25 September 2026 and reconciled with the accepted production state on 7 October 2026. The web cutover is in progress; new-city public announcements remain deferred under BW-50.

## 1. Scope and release gates

Target web origin: https://bitcoinwalk.org on 213.232.235.138. Free-city event URLs: https://bitcoinwalk.org/<city>/<nevent>. Shared event relay: wss://relay.bitcoinwalk.org (documented loopback 3340). Existing production community stays on chat.bitcoinwalk.org. Paid subdomains activate only after entitlement, DNS, dedicated relay and group are verified; a requested Paid plan is insufficient.

Keep the legacy website available until cutover and recoverable afterwards. The legacy host was previously recorded as 213.232.235.240; later conversation mentioned .140, so establish the actual authoritative apex A/AAAA answers and origin before planning rollback. Do not repurpose or erase that server during this migration. Preserve payment, Alby, Matrix, email and unrelated hosts.

Launch can be limited to the working free-city service. Paid purchasing must remain unavailable or clearly pending until payment and provisioning acceptance is complete.

The accepted promotion manifest now contains 12 approved cities and 110 signed events. London is the sole paid city. The atomic production promotion passed on relay `0.8.76`; London remained exact 8/8 and its production replication entitlement/registry activation passed on `0.8.78`. The earlier two-city proposal in this document is historical and no longer governs launch.

Before public web cutover, keep the existing encrypted off-server recovery copy, capture a fresh application/media checkpoint, and agree the short final synchronization window. The ordinary `bitcoinwalk` account deploys and runs the application; only Caddy and DNS activation require privileged/external changes.

## 2. Read-only inventory and source checkpoint

Record exact effective systemd units and drop-ins, active binaries/releases and SHA-256 hashes, state-directory resolved paths, listeners, Caddy configuration, DNS records and TTLs. Export DNS zone state without exporting the registrar token. Check apex, www, explicit relay/chat/city records, wildcard, A and AAAA; preserve MX/TXT/CAA and unrelated records.

Inventory organizer staging and production databases, production chat and any paid-city databases, media assets and manifest/audit/budget state, Guide config and durable notification outbox, relay and Guide private credentials, app credential references, Caddy certificate state, runtime, release archives, and the legacy WordPress database/media/configuration. A photo download alone is not a WordPress backup.

Review the dirty repository and create an explicitly selected release checkpoint; avoid blindly committing unrelated files. Record source commit, build inputs, artifact hash and ngit/GitHub mirror status. The existing staging runbook contains historical 0.3.6 observations and must not be treated as a fresh inventory.

## 3. Backup and restore rehearsal

Check source and destination free space first. Do not create a large tar archive on a nearly full server. Prefer an encrypted backup streamed to the selected remote destination, with credentials supplied outside shell history. Keep a local operational rollback copy plus an encrypted off-server recovery copy.

For each database, identify the actual storage engine. Use its documented consistent backup mechanism or stop all writers for a short capture window, copy the entire state directory and restart the recorded services. Never assume copying an open events.db gives a consistent backup. Include journals/WAL and sidecars when required. Quiesce Guide and media mutations while capturing their related state. Resolve DynamicUser state-directory symlinks so archives include actual data and required ownership metadata.

Back up units/drop-ins, Caddy config/certificates, binaries and runtime, release artifacts, databases, media and manifest, Guide outbox/configuration and credentials as separate identifiable components. Restrict plaintext copies to root; encrypt secrets off-server. Do not put secrets in the repository, deployment tarball or diagnostic output.

Write a manifest containing capture time, source host, service version, source paths, database consistency method, archive hashes, object counts and recovery requirements. Verify remote checksums and actually decrypt and restore onto an isolated disposable environment. Disable outbound notifications, image generation and public writes in that environment. Verify city/event counts, signatures, approval/revocation/deletion history, representative media hashes and fallback behavior. Test restoring the relay identity without publishing anything.

Proposed objectives: launch backup captured immediately before write cutover; rehearsed application/proxy rollback within 15 minutes. These are targets until timed in rehearsal. Take daily encrypted backups after launch with 7 daily and 4 weekly retention points, subject to measured storage capacity. Alert on backup failures and periodically repeat restoration.

## 4. Data and URL migration

Build a manifest of approved cities, organizers, events, historical revisions, approval decisions, permissions, delegation acceptances/revocations, cancellations/deletions and referenced media. Include the complete dependency history required by relay policy; validate a promotion in an isolated production-shaped relay before touching live state. Reject a promotion that resurrects canceled events or loses permissions.

Preserve signed Nostr events byte-for-byte and verify their signatures and IDs after import. Changing a signed URL or tag requires a new organizer/admin signature; do not rewrite records. A nevent can include a staging relay hint, so retain a tested compatibility path for old identifiers and staging relay reads. Do not rely on HTTP redirects to migrate WebSocket subscriptions.

Copy managed media with original content hashes. Previously signed app-staging image URLs must keep resolving; serve retained immutable media or introduce a tested compatible redirect to the corresponding production object. Never redirect every staging path indiscriminately. Staging test records remain available only as appropriate for staging.

Export or explicitly recreate browser-local recurring draft plans: these do not migrate merely by moving a server or hostname. Browser storage is origin-specific. Explain this to organizers before switching domains.

Prepare explicit redirects for retained legacy city paths and renamed slugs. Every city remains under `bitcoinwalk.org/<city>` regardless of tier. Paid city subdomains serve relay traffic and redirect ordinary legacy browser requests to the canonical apex city path. Exact event links retain event identity. Preserve the existing current-event grace behavior and no-upcoming-walk state.

## 5. Production deployment rehearsal

Prepare a separate production app service, release directory, cache and media storage. Choose a verified unused loopback port during inventory. Build with production public read/write relays and invitation URLs; NEXT_PUBLIC values are embedded at build time. Configure server reads to production loopback 3340 and media public origin to https://bitcoinwalk.org. Audit all staging domains in built assets, metadata, canonical/share links, chat configuration, Guide messages and image origins.

Keep the Guide worker scoped to the intended relay and durable outbox. Baseline imported historical approvals deliberately so cutover cannot send a historical DM flood. Keep public city announcements disabled. Preserve the pinned permitted image model and provider budgets, and decide whether staging generation should be disabled or budgets shared to avoid multiplying spend across two services.

Verify loopback health, static assets, anonymous event reads, current-city redirects, media, admin role boundaries and blocked diagnostic endpoints. Provision and validate production TLS before changing public traffic, using an appropriate challenge method. Preview the exact production host against .138 using local resolution or curl --resolve; a staging hostname alone cannot prove production host routing. Verify DNS API access with a read-only operation if automation is used; manual DNS remains sufficient for this cutover.

## 6. Cutover order

1. Lower only affected DNS TTLs sufficiently in advance for the old TTL to expire. Record previous values.
2. Complete the restore rehearsal, final release verification and city promotion manifest approval.
3. Begin the agreed write freeze; pause affected notification workers and capture final consistent backups/deltas.
4. Import the approved records and media; verify hashes, signatures, counts, permissions and tombstones.
5. Start production app and verify exact-host HTTPS, routing and public/browser relay targets before opening writes.
6. Validate the merged Caddy candidate against the immediately preceding configuration, preserving other host blocks. Activate only the intended production app routes.
7. Change the approved apex/www DNS records to .138, including any conflicting AAAA records. Preserve wildcard and unrelated records. Keep the previous origin usable during cache overlap; prevent divergent writes.
8. Check authoritative DNS and independent recursive resolvers. Test organizer login, submission, approval, first walk, edit/cancel/delegate, image generation/import and Armada joining. Signing is performed by the user.
9. Resume production writes and Guide delivery, verify exactly one intended live-link DM, and watch error rates, disk, media alerts and relay rejections. Keep staging compatible during transition.
10. Once canonical event links and production acceptance pass, enable BW-50 as a separate signed workflow. Do not broadcast historical staging announcements automatically.

## 7. Rollback by failure type

Application failure: restore the recorded previous production unit/release configuration, reload systemd, restart the app, verify loopback/public health and a real event. Keep current data and media. Do not switch to a staging build that writes to the staging relay.

Proxy/TLS failure: validate and restore the immediately preceding Caddy configuration, preserving any later unrelated changes; reload and verify all affected production and existing hostnames. Record exact backup paths in the execution manifest.

Domain failure: restore the exact previous A/AAAA/CNAME values and TTLs from the DNS export. DNS rollback is not instant; keep both origins serving a consistent maintenance/read-only experience during propagation. Check TLS and redirects on both origins.

Data failure before reopening writes: stop affected writers, preserve the failed state for diagnosis, restore the verified consistent snapshot and matching binary/configuration, then verify records and media before reopening.

Failure after production writes: freeze writes first and export the post-cutover delta, including cancellations, approvals and delegation changes. Roll back application/proxy independently where possible. Never restore an older database over newer writes without a validated reconciliation plan. A return to WordPress does not remove the need to preserve production relay data.

Trigger immediate containment for unauthorized writes, missing/corrupt records, exposed credentials or incorrect relay destinations. Roll back the affected layer for persistent 5xx/redirect loops, failed signing/publication or unusable media. Keep announcements and automated messages paused during recovery.

## 8. Evidence required to close migration

Record release/source hashes, backup location and manifest, successful restore date and duration, promoted city IDs, DNS before/after, Caddy and unit backup paths, successful exact-host/public checks, user signed acceptance and rollback rehearsal. Keep the old website recoverable through an agreed observation period (proposed minimum seven days) and until off-server restore is verified. Retirement/reuse of the old host is a separate task.

Current action: build and privately activate the isolated production app on `.138`, publish the production directory aliases, validate the exact host, then move only apex and `www` traffic. The legacy `.240` host remains intact for rollback.

## 9. Superseded two-city proposal — 25 September 2026

This proposal was superseded by the accepted 12-city/110-event production promotion on 7 October 2026. It remains below only as historical migration evidence and must not be used to rebuild current production.

A public read of the staging relay found 11 related signed records for Warszawa: one authorization (30302), one city revision (30303), one approval (30304) and eight NIP-52 occurrences (31923). It found 18 related signed records for Szydłowiec: one authorization, three city revisions, three approval decisions, two delegation invitations (30305), one delegation acceptance (30306), and eight occurrences. All 29 returned records passed signature verification. The selective exporter must still prove complete dependency closure against the database backup and relay policy before import.

Warszawa currently references `https://bitcoinwalk.org/wp-content/uploads/2025/04/warsaw.webp`; this legacy-origin asset must be ingested into managed production media or kept resolvable before the WordPress origin is replaced. Szydłowiec references three immutable staging managed-media hashes; all three files and manifest records must be retained or served through compatible production paths. Existing signed URLs cannot be rewritten without new signatures.

The encrypted pre-migration VPS archive was captured to `/home/endo/BitcoinWalk-backup/bitcoinwalk-vps-20260925T121338Z.tar.zst.enc`. Its transferred SHA-256 matched and the user successfully decrypted and traversed the complete compressed tar stream. All recorded services and public health endpoints were active afterwards. The encrypted source copy remains on the VPS pending restore rehearsal and production acceptance.
