# Security and launch operations

Status: BW-21 is in progress. The 13 October 2026 standard repository scan is complete; its canonical scan ID is `26c67b4d-4daf-4e1e-bb39-1b2255a44132`.

The review covered public and authenticated APIs, Nostr authorization, NWC and LNURL payment paths, sponsorship recovery, media imports and uploads, internal worker authentication, deployment units, protected files, backups and production runtime boundaries. The production dependency audit found no critical, high or moderate advisory. The app configuration files are owner-only, application ingress is proxied to loopback, and the paid-city relay containers run as a non-root UID with a read-only root, all capabilities dropped, private networking and no host-published ports.

One medium authorization finding was reproduced on staging and production: `/api/monitoring/relays` treated a browser-supplied public super-admin key as authentication. BW-122 replaces that contract with a fresh kind-27235 signature bound to the exact origin, POST method, route and action. The previous header is ignored, bodies remain bounded, and non-admin, expired, altered-origin and altered-method requests fail closed.

The remaining BW-21 work is operational rather than application feature work:

1. Complete the human super-admin acceptance of BW-122. Release `0.3.300` is active on staging and production; both report healthy, the former forged-header GET returns 405 and an unsigned POST returns 403. The remaining check is one successful signed refresh from the super-admin dashboard.
2. Complete BW-123. The `.240` listener/container/proxy inventory is recorded and the narrow `0.8.93` binding change is prepared. It leaves public web, Matrix, Lightning, SSH and active FTP untouched and makes only Nginx administration 81, MetaManager 7532 and legacy Rustress 8889 loopback-only. Activation requires explicit approval because it briefly recreates three shared-host containers; the script creates a root-only backup and restores the original compose file on failure.
3. Complete BW-124 by restoring current application, SQLite/WAL, media, configuration and relay backups into isolated paths and verifying the recovered invariants without touching live state.

BW-21 closes only after all three child items are accepted. Security headers, dependency advisories and rate limits remain recurring operational checks rather than one-time evidence.
