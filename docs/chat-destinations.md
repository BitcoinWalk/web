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
Unknown well-formed short city paths return 404, not a fallback conversation.
This short-path follow-up is implemented locally, not yet deployed. The shared
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
Exact-room recovery through login, cancellation, refresh and account changes is
**BW-157**, not an acceptance claim of this contract. OS App/Universal Link
association and installed-app delivery remain **BW-158**.

## Cross-client fixtures and acceptance

`src/domain/fixtures/chat-targets-v1.json` is the shared versioned fixture set for
web and mobile implementations. It includes all four destination intents and
malformed/authority-bearing paths. The platform-independent parser and formatter
are in `src/domain/chat-target.ts`; registry resolution is server-only.

Executable web coverage includes Basic/Pro isolation, group rotation, signed
rename aliases, archived/ambiguous cities, missing transport, Hosts privacy,
query-parameter claims, exact browser redirect paths and endpoint status codes.
Mobile fixture execution and real installed-app acceptance remain a handoff to
the Walkie Talkie workstream; no mobile changes or app-link claims ship here.

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
