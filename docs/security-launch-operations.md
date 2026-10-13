# Security and launch operations

Status: BW-21 is complete. The 13 October 2026 standard repository scan and all three bounded remediation/acceptance items are accepted; the canonical scan ID is `26c67b4d-4daf-4e1e-bb39-1b2255a44132`.

The review covered public and authenticated APIs, Nostr authorization, NWC and LNURL payment paths, sponsorship recovery, media imports and uploads, internal worker authentication, deployment units, protected files, backups and production runtime boundaries. The production dependency audit found no critical, high or moderate advisory. The app configuration files are owner-only, application ingress is proxied to loopback, and the paid-city relay containers run as a non-root UID with a read-only root, all capabilities dropped, private networking and no host-published ports.

One medium authorization finding was reproduced on staging and production: `/api/monitoring/relays` treated a browser-supplied public super-admin key as authentication. BW-122 replaces that contract with a fresh kind-27235 signature bound to the exact origin, POST method, route and action. The previous header is ignored, bodies remain bounded, and non-admin, expired, altered-origin and altered-method requests fail closed.

BW-21 closed through three independently recoverable changes:

1. BW-122 is complete. Release `0.3.300` is active on staging and production; both report healthy, the former forged-header GET returns 405, an unsigned POST returns 403, and the user accepted a successful super-admin-signed refresh on 13 October 2026.
2. BW-123 is complete. Approved operator `0.8.93` made Nginx administration 81, MetaManager 7532 and legacy Rustress 8889 loopback-only with automatic rollback and root-only evidence `/var/backups/bitcoinwalk-shared-host-ingress.HmBOqT`. Required public web, SSH, active FTP, Matrix and Lightning ingress and every checked proxied BitcoinWalk service remained healthy.
3. BW-124 is complete. The current production app `0.3.301`, its exact Node runtime, owner-only configuration, transactionally consistent payment SQLite/WAL state, media and city-logo assets were checksum-verified, restored and started on isolated loopback port 3399 as the non-root application user. Database integrity and table counts were unchanged and the exercise completed in 31 seconds; evidence is `/home/bitcoinwalk/backups/bitcoinwalk-production-recovery-rehearsal.ouo57j`. Protected relay operator `0.8.94` then validated and restored the production bbolt database, binary and effective service contract, started the recovery relay as non-root on loopback port 3398, and proved an exact complete event-ID-set match with live production in 2 seconds; evidence is `/var/backups/bitcoinwalk-production-relay-recovery.gqL6kq`. Live production remained active and unchanged.

Security headers, dependency advisories, ingress inventory, rate limits and recovery rehearsals remain recurring operational checks rather than reopened launch work.
