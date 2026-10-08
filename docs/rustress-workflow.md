# BW-100 — durable app provisioning workflow

8 October 2026. Deployed in staging app 0.3.197; generic provisioning not enabled for any pilot city
and not deployed to production. This integration can only prepare disabled configuration. It cannot
activate public NIP-05/LNURL endpoints, create invoices, or move money.

The separately gated [Madeira private rehearsal](madeira-private-pilot.md) is
deployed in staging app 0.3.198: reuse its existing city identity and saved checkout
payout through private owner/admin proofs, with a test-only unpaid entitlement.
This never relaxes the ordinary paid setup rules below. Madeira has been approved
on staging; real signed evidence preflight passes, invoice remains pending and no
paid entitlement exists. Production/profile/public addresses are untouched.

## Entry and recovery

After exact signed city-brand publication/read-back, the internal hook attempts
to save a provisioning task. A separate 30-second reconciliation loop recovers
an interruption between activation and enqueue by scanning active requests for
explicitly allowed test cities. It does not delay checkout reconciliation.
Neither paying for Pro nor private super-admin attestation alone is sufficient.

The feature requires `BITCOINWALK_RUSTRESS_FIXTURE_ENABLED=1`, an explicit bounded
`BITCOINWALK_RUSTRESS_FIXTURE_CITIES` UUID allow-list (maximum ten), a mode-0600
`BITCOINWALK_RUSTRESS_TOKEN_FILE`, loopback-only `BITCOINWALK_RUSTRESS_ORIGIN` and
the exact artifact SHA-256 in `BITCOINWALK_RUSTRESS_REVISION`. The app pilot flag
and city allow-list remain unset. The dedicated private token file and persistent
restricted SSH transport are installed; no new public API is added.

The internal resolver obtains current signed approval/creator authorization,
anchored ownership, settled entitlement and moderation state. It requires the
existing active branded binding, fresh exact read-back on every configured write
relay, matching signer/artwork/payout task versions and the current owner's saved
signed payout confirmation. It repeats LNURL validation (including blocking the
managed bitcoinwalk.org domain) and rereads authority after endpoint validation.
Browser-supplied npubs, addresses or hashes cannot directly create a task.

The task freezes canonical configuration and an evidence hash covering authority,
entitlement, approved profile and payout version. Wallet reference is fixed to
`isolated-test`; allocation is 7900/2100 basis points and issuance is disabled.

## Durable state

`rustress_provision_task` is private SQLite state alongside existing setup data.
One immutable initial-version task is stored per city; conflicting evidence or
another request cannot overwrite it or silently increment its version. Only
city ID, state and disabled issuance are exposed by the workflow status method.
Provider error details and credentials are never persisted or logged.

- Queued: exact request saved before any provider write.
- Preparing / applying: persisted before each network mutation.
- Prepared: independent exact provider read-back completed.
- Unknown: response lost, interrupted mutation, unavailable or mismatched status.
  Recovery first reads status; it never treats an unavailable/404 response as
  proof of absence. No blind write retries occur in this state.
- Verified: exact applied configuration read back; **not public activation**.
- Blocked: changed evidence or definitive rejected write requires review.

Two-minute database leases prevent concurrent workers from progressing the same
task. Every write and completion rechecks fresh authority and the current lease.
Expired workers cannot record completion; a replacement first reconciles the
persisted in-flight state. Provider idempotency protects any already-sent write.
Initial relay outages leave an unsent task queued, with no provider mutation.

## Evidence

Full suite: 879 tests across 170 files pass on Node 24, including 18 new
workflow/resolver/runtime tests. TypeScript, changed-file lint and the production
build pass. The runtime-only token read is excluded from build-time file tracing.

Workflow tests cover duplicate tasks, changed configuration/entitlement, lost
responses, unknown-state reconciliation, lease recovery, authority changes
between prepare/apply, outages and redacted errors. Resolver tests use real
synthetic owner/city/admin signatures and cover active publication, missing or
forged relay read-back, suspension, unpaid cities, stale payouts and ownership
changes during endpoint validation. Runtime tests cover default-off behavior,
mandatory allow-list and private token-file gating.

`scripts/test-rustress-workflow.mjs` ran the app workflow through a temporary
loopback SSH tunnel to the isolated `.240` service. It used the existing synthetic
fixture city (already applied by the service acceptance tests), verified exact
idempotent read-back, reopened the local workflow database and verified recovery
without a second task. The tunnel was closed and temporary local token copy
deleted afterwards. No real city, payout identity or wallet was used.

## Remaining gates

Select a paid staging city and complete its owner/city-signer setup before
enabling an explicitly agreed pilot. Full real-city integration
acceptance, queue status/recovery UI, reviewed update/cancellation semantics,
unknown-but-confirmed-absent recovery, security review, backup acceptance and
BW-18/BW-19 live provisioning remain. Verified fixture state must never be
presented as an active Lightning address. BW-109 standalone no-split addresses
remain a separate resource contract; London/endo/donate are unchanged.

## Staging deployment and transport evidence

App `0.3.197` (source `acc2111`) passed Node-24 build/package smoke and was
deployed as non-root bitcoinwalk. Archive SHA-256:
`0bada485f0788fbd4b243669abef7ab318150718e0ef119a14958523c9896c06`.
Backup/evidence: `/home/bitcoinwalk/backups/app-staging-deploy.NcaK5k`.
Active release: `/opt/bitcoinwalk-app-staging/releases/0.3.197-0bada485f078`.
Public/loopback health returns this version; `/admin/upgrade` returns 200.
Previous release 0.3.196 is retained. No production deployment occurred.

On `.138`, user service `bitcoinwalk-rustress-tunnel.service` binds only
127.0.0.1:18890, forwarding to `.240` 127.0.0.1:8890. Its dedicated SSH key was
generated on `.138`; the private key never left that host. `.240` trusts only
that key from source 213.232.235.138, with restricted forwarding destinations
and reverse listeners confined to 127.0.0.1:8890, forced `/bin/false`, and no
PTY/agent/X11/user-rc. Host identity is pinned. Existing SSH keys were preserved
with a private backup before appending this restricted key. No root or sudo was
used. The dedicated fixture API token was transferred privately to
`/home/bitcoinwalk/.config/bitcoinwalk-rustress-tunnel/api-token` on `.138`.

`verify-staging-tunnel.py` passed authenticated pinned-capability read-back,
unauthenticated denial, rejected shell execution, rejected live port-8889
forwarding and rejected unrelated reverse-port forwarding. Both user services
are active. App provisioning remains disabled; the tunnel alone grants no
payment capability and activates no city.

Read-only paid staging inventory: London (approved), Radom (archived), Cherokee
County (signed submission found, no approval found). No Pro setup tasks or
city-brand requests exist yet. The user must select a pilot; London remains MEP.
No city was restored, approved or signed during this deployment.
