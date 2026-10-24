# Canonical chat destinations (BW-156)

Contract version 1, 20 October 2026. These links express a destination, never
identity, authorization, membership or payment authority.

| Permanent HTTPS path | Target | Access checked by the receiving client and relay |
| --- | --- | --- |
| `/chat/<approved-city-slug>` | `{version:1, kind:"city", cityId}` | Current public group membership |
| `/chat/guide` | `{version:1, kind:"guide"}` | Connected account's own encrypted inbox |
| `/chat/global` | `{version:1, kind:"global"}` | Current public group membership |
| `/chat/hosts` | `{version:1, kind:"hosts"}` | Exact relay-signed private Hosts roster |

Production links use `https://bitcoinwalk.org`; staging uses its own application
origin. Never build links with an account, role, relay URL or group ID supplied
by a sender. Existing Guide invitations to `/chat/hosts` remain valid.

City links use the short form, for example `/chat/madeira`. The former
`/chat/city/madeira` form remains accepted and redirects to `/chat/madeira`.
`guide`, `global`, `hosts` and the legacy prefix `city` are reserved chat path
segments, case-insensitively; cities and their aliases cannot shadow them.
Unknown well-formed short city paths return 404 from the strict resolver API,
not a fallback conversation. The human-facing `/chat/...` route carries a valid
unknown or temporarily unavailable target into the dashboard so the user sees
an explicit recovery state instead of raw resolver JSON.
This short-path follow-up is deployed to staging and production as 0.3.458. The shared
fixtures now include the legacy path and its short canonical destination.
Verification: all 2,009 tests passed (45 focused contract/endpoint tests), plus
type checking, changed-file lint, the production-mode build and backlog checks.

## Resolution

`GET /api/chat/destination?path=<URL-encoded-path>` returns a public, read-only
projection. Successful responses include `version`, `state:"resolved"`, `target`,
`canonicalPath`, `webPath`, `access` and `transport`. No cookies, signatures or
app installation are required to resolve an address. A resolved address does
not mean that its requester is authorized or has joined it.

- City targets bind the immutable approved city ID, not its current display name.
  Slugs, approved aliases and city IDs resolve through the current approved-city
  projection. An approved alias redirects to the current canonical slug. A rename
  must retain its old name in the signed aliases, as for existing public pages.
- City and Global NIP-29 transports come from the current active registry, so
  group rotation does not change a permanent link. A disabled or missing city
  group never silently opens Global instead. No host-based tier guess is used.
- Guide exposes only the configured validated public Guide identity. Each client
  must discover and decrypt the connected account's own inbox.
- Hosts returns `access:"signed-host-roster"` and `transport:null`. Its private
  room coordinates and roster are not disclosed by this anonymous endpoint.
  Existing authorized-client discovery and relay enforcement remain authoritative.
- Invalid paths return 400, unknown/archived cities return 404, and unavailable
  registry/transport/Guide data returns 503. Responses are not cached.
- URL query parameters cannot grant roles, select another relay, override the
  resolved room, trigger a join, send a message or choose an external redirect.

The HTTPS entry points redirect to the existing `/admin/chat` destination, or
first to the canonical city path for an alias. They perform no signed actions.
BW-157 now keeps that exact City, Guide, Global or Hosts intent in the browser
URL through initial connection, signer cancellation, refresh and account
switching. Ambiguous links, unknown cities and unauthorized Hosts requests show
an explicit recovery state instead of substituting another room. Manual room
changes replace the URL with the newly selected exact destination.

Public City and Global membership is rederived from the latest signed kind-39002
roster. A join request is sent only from the explicit Join action, and the UI
does not say Joined or enable sending until the relay's signed roster contains
the connected pubkey. Pending requests offer a read-only membership recheck
instead of publishing duplicate joins. Hosts remains gated by current verified
city authority and the private relay; Guide opens the connected account's own
NIP-17 inbox. Staging deployment is complete; cross-role authenticated human
acceptance remains before BW-157 can be marked Done. OS App/Universal Link
association remains **BW-158**.

BW-157 staging verification, 24 October 2026: the ancestry-safe source
`0337df17ace513d34c5d904a9f49a88ecc56edd3` was deployed as
`app-staging-0.3.504` after inheriting the concurrent sponsored-preview release.
CI run `40083620989`, the standalone package smoke test, loopback and public
HTTPS health, the exact Hosts redirect, removal of URL role claims and the
contextual disconnected recovery screen passed. Deployment evidence is
`/home/bitcoinwalk/backups/app-staging-deploy.JWpPp1`; no signed membership or
message action was performed by deployment verification.

The first human check then exposed raw `{state:"unavailable"}` JSON for Madeira,
whose staging group transport was absent. The follow-up keeps resolver API
404/503 semantics while redirecting every syntactically valid human chat link
to its exact dashboard intent; malformed paths still return 400 and no fallback
room is selected. Release `0.3.506` carries this correction after inheriting
the concurrently activated sponsor-card `0.3.505` source.

Staging `0.3.506` at source `a5d9da2` passed CI run `40084527957`, standalone
package smoke and guarded activation on 24 October. Public verification confirms
`/chat/madeira` now redirects to `/admin/chat?city=madeira` and renders the
contextual connection screen, while `/api/chat/destination` truthfully remains
`503 {state:"unavailable"}` until Madeira has a configured group. Evidence is
`/home/bitcoinwalk/backups/app-staging-deploy.m5qE7H`.

Production promotion, 24 October 2026: source
`c3a6b1c53179f47dbbac5efbbecfcb0e8d78c0d2`, whose runtime includes the exact
staging-accepted correction at `a5d9da2`, was rebuilt with production relay and
invitation settings and activated as `app-production-0.3.506`. The production
archive SHA-256 is
`5676775a1b6d1f53ce31777a4a0e379eb7abc45b2c1f92b1d6bfbcfa0ca0573a`;
package smoke, CI run `40084814855` and the guarded current-release check passed.
Public verification confirms health reports `0.3.506`, `/chat/madeira` redirects
exactly to `/admin/chat?city=madeira`, the disconnected page renders **Open
Walkie Talkie**, and the strict resolver returns Madeira's current production
NIP-29 destination without changing membership or messages. Deployment evidence
is `/home/bitcoinwalk/backups/app-production-deploy.qtLfgA`.

## Cross-client fixtures and acceptance

`src/domain/fixtures/chat-targets-v1.json` is the shared versioned fixture set for
web and mobile implementations. It includes all four destination intents and
malformed/authority-bearing paths. The platform-independent parser and formatter
are in `src/domain/chat-target.ts`; registry resolution is server-only.

Executable web coverage includes Basic/Pro isolation, group rotation, signed
rename aliases, archived/ambiguous cities, missing transport, Hosts privacy,
query-parameter claims, exact browser redirect paths and endpoint status codes.
The byte-identical mobile fixture and installed Android app acceptance completed
on 24 October 2026 in Walkie Talkie commit `ccbfdb2`. No app-link claim ships in
BW-157; installed-app delivery remains BW-158.

Local verification, 20 October 2026: all 1,998 tests passed, including 34 focused
contract/endpoint checks. Type checking, changed-file lint, backlog generation
and the release-mode build passed. Standalone HTTP checks verified relative
Hosts/Global redirects, ignored URL access claims, anonymous Hosts privacy,
missing Guide configuration as 503, and malformed/duplicate targets as 400.
No message, membership action, external push or deployment was performed.

Staging verification, 20 October 2026: runtime commit
`d54c768ecb313d24483d7f6fc3f18738e9c55be6` was pushed to GitHub and ngit and
deployed as `app-staging-0.3.457`. Package SHA-256:
`1b0cc2d29f869f863b22eff875cff18f4060fdb0c5595db45845cbbed77585f1`.
The guarded deployment accepted the expected 0.3.456 predecessor; evidence is
`/home/bitcoinwalk/backups/app-staging-deploy.hSksNQ` on the staging host.
Live read-only checks passed for all 19 city resolver mappings and redirects,
Guide/Global/Hosts links and resolution, anonymous Hosts privacy, four malformed
or unknown-target responses, and the source-specific static build manifest.
The staging service is active. Production remains `app-production-0.3.454`.
No messages or membership actions were performed. Mobile fixture execution and
human acceptance remain pending; BW-157/BW-158 are not included.

Short-path staging verification, 20 October 2026: runtime commit
`d1befd06c9c3e8e101f09d54785ea0257d9fa239` was pushed to GitHub and ngit and
deployed as `app-staging-0.3.458`. Package SHA-256:
`e247bee941f8f206387cba0264b34046a655e026e6372adc2e6273cac8020fb0`.
The guard accepted the recorded 0.3.457 predecessor; deployment evidence is
`/home/bitcoinwalk/backups/app-staging-deploy.1BeGES` on the staging host.
All 19 cities passed live short-link redirects, legacy-to-short redirects and
resolver identity/current-group checks. Guide/Global/Hosts redirects, Hosts
privacy, legacy resolver canonicalization, four unknown/malformed/reserved-path
checks and the source-specific static manifest passed. The service and loopback
health are healthy. Production remains `app-production-0.3.454`; no signed
actions, messages or membership changes were performed.

Production promotion, 20 October 2026: the exact staging-tested source
`d1befd06c9c3e8e101f09d54785ea0257d9fa239` was separately rebuilt with production
relay and invitation settings. All 2,009 tests, type checking/build and production
package smoke checks passed. Evaluating the emitted browser relay module verified
production read/write/directory configuration; staging strings retained as unused
defaults are not effective relay settings.
Package SHA-256: `6491069f967e165d36b93ac4aec79f3dfc77edf5faf1cc0f2f7a6f9598a0ee25`.
The guard activated `app-production-0.3.458` from the recorded 0.3.454 predecessor.
Evidence and the consistent online payments backup are retained at
`/home/bitcoinwalk/backups/app-production-deploy.lh3C8f` on the production host.

Production readiness differs from staging: 21 approved cities, but only Hradec
Králové, Lugano and Madrid have active city-group records. A read-only comparison
of the pre-release database backup and live database found exactly the same three
records, all public-enabled. Live checks across all 21 cities verified working
short links, legacy redirects and resolver identity/current-group mappings for
those three, and safe 503 responses (no Global fallback) for the other 18, including
Madeira and London. Guide/Global/Hosts redirects and resolution, Hosts privacy,
five malformed/unknown/reserved-target checks and the source-specific static
manifest passed. Production service and public/loopback health are healthy;
staging remains 0.3.458. Missing production groups require the separate signed
provisioning workflow; this release did not create groups or change membership.
BW-156 remains in progress pending production provisioning, mobile fixture
execution and human acceptance; BW-157/BW-158 remain separate.
