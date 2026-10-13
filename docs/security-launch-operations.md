# Security and launch operations

Status: BW-21 is in progress. The 13 October 2026 standard repository scan is complete; its canonical scan ID is `26c67b4d-4daf-4e1e-bb39-1b2255a44132`.

The review covered public and authenticated APIs, Nostr authorization, NWC and LNURL payment paths, sponsorship recovery, media imports and uploads, internal worker authentication, deployment units, protected files, backups and production runtime boundaries. The production dependency audit found no critical, high or moderate advisory. The app configuration files are owner-only, application ingress is proxied to loopback, and the paid-city relay containers run as a non-root UID with a read-only root, all capabilities dropped, private networking and no host-published ports.

One medium authorization finding was reproduced on staging and production: `/api/monitoring/relays` treated a browser-supplied public super-admin key as authentication. BW-122 replaces that contract with a fresh kind-27235 signature bound to the exact origin, POST method, route and action. The previous header is ignored, bodies remain bounded, and non-admin, expired, altered-origin and altered-method requests fail closed.

The remaining BW-21 work is operational rather than application feature work:

1. Complete the human super-admin acceptance of BW-122. Release `0.3.300` is active on staging and production; both report healthy, the former forged-header GET returns 405 and an unsigned POST returns 403. The remaining check is one successful signed refresh from the super-admin dashboard.
2. Complete BW-123 by reducing the shared `.240` host's public listener set to deliberately public services only, with configuration backup and rollback evidence.
3. Complete BW-124 by restoring current application, SQLite/WAL, media, configuration and relay backups into isolated paths and verifying the recovered invariants without touching live state.

BW-21 closes only after all three child items are accepted. Security headers, dependency advisories and rate limits remain recurring operational checks rather than one-time evidence.
