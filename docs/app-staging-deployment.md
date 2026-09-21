# BitcoinWalk web staging deployment notes

This records the initial 0.1.0 staging installation. For the audited current layout and operator release/rollback procedure, see [the staging runbook](app-staging-runbook.md). The app installer scripts named below are not in this repository checkout. Do not run these historical steps as a release procedure.

Target: app-staging.bitcoinwalk.org, 213.232.235.138 only. App listens on loopback 3338 with a dedicated dynamic service identity and app-private pinned Node 24.21.0. Public build settings use relay-staging.bitcoinwalk.org and https://app-staging.bitcoinwalk.org/start for invitation previews. No private keys, .env files or databases belong in this package.

1. The initial installation used `deploy/install-app-private.sh` (not present in this checkout) to install only the loopback app. Downloaded Node was checked against its pinned official SHA-256 before extraction. It required root and avoided a system-wide runtime installation.
2. Independently verify loopback health, HTML/static assets and relays.
3. The initial HTTPS activation used `deploy/enable-app-https.sh` (not present in this checkout) to check DNS, validate Caddy configuration and verify TLS/health.

No actions sign, submit or delete Nostr events. All editor/approval actions still require the user's extension. Public staging is not access-controlled; noindex is not authentication. Pending proposals were already publicly readable. Diagnostic preview routes and the unused pending-list API are blocked at the edge. Public search is an explicit button using Nominatim; one app process, global 1.1-second upstream spacing, no concurrent calls, bounded memory and Next 24-hour response cache. No horizontal scaling until a shared geocoding limiter/cache or new provider is added. Provider URL is runtime-configurable in the service environment. Policy: https://operations.osmfoundation.org/policies/nominatim/

Rollback: before HTTPS activation, stop/disable only bitcoinwalk-app-staging. After activation, restore the installer-reported Caddy backup only if there have been no later Caddy edits; validate and reload it, then stop/disable the app. Otherwise remove only the app-staging host block through a reviewed configuration edit. Do not restore an old Caddyfile over newer unrelated changes. Retain release/runtime files for diagnosis; no relay database restoration is involved.

Production migration is separate: rebuild with production public settings, verify domain/relay ownership, retain staging relay aliases for existing signed links, and only then cut over legacy traffic. This release does not touch apex/www or existing relays.
