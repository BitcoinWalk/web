# Preproduction housekeeping and security review — 2–3 October 2026

This is a bounded source/dependency/configuration review, not a penetration test
or production acceptance. No production cutover, wallet operation, relay state
mutation or candidate endpoint migration was performed.

## Backups

Local private directory: `/home/endo/Work/backups/preprod-2026-10-02`.
`work-source.tar.gz` preserves the maintained repositories and historical dirty
worktrees, excluding dependencies/build caches/release archives. Git bundles
preserve web and relay refs/history. Bundle verification and complete archive
traversal passed. Old uncommitted payment work remains untouched.

On `.138`, connected only as `bitcoinwalk`: private app backup
`/home/bitcoinwalk/backups/preprod-housekeeping.w5syb4_b` includes SQLite online
backup, private environment file, user service, deployment helper, current release
archive and SHA-256 manifest. SQLite integrity and release archive traversal pass.
No credentials were printed. This is not an off-host full VPS backup; relay/Guide,
managed media, proxy state and `.240` restoration remain BW-53 responsibilities.

## Security findings

- **Resolved in source; deployment pending:** Next.js 16.3.5 triggers critical
  [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j).
  Source contains no `next/og` or `ImageResponse` usage, so the described vulnerable
  application path was not found. Next and matching ESLint config are pinned to
  16.3.8. Post-update npm audit: zero critical/high/moderate, three low findings.
  Prepared app release is 0.3.130; live remains the accepted 0.3.129.
- **Open, low:** `bolt11` → `secp256k1` → `elliptic`,
  [GHSA-848j-6mx2-7j84](https://github.com/advisories/GHSA-848j-6mx2-7j84).
  The application imports invoice decoding; do not apply npm's suggested breaking
  downgrade to bolt11 1.0.0 without an invoice compatibility/security review.
- **Go scan:** govulncheck reports zero reachable vulnerable symbols, with one
  imported-package and 32 required-module findings outside detected call paths.
  Scanner v1.8.0 selected Go 1.26.8 to run; this does not prove old deployed Go
  runtime binaries are patched. Test/vet used installed Go 1.25.14. Recheck the
  exact release compiler and full findings before production.
- **Launch configuration:** payments runtime currently accepts only a staging
  state directory under production NODE_ENV. The release packager explicitly
  requires staging relay defaults. Both need tested production configuration,
  not hostname search/replace during deployment.
- **Reviewed controls:** payment routes validate signed commands, origin and body
  size; creation is owner-bound and durable/idempotent; settlement checks amount,
  hash and preimage; NWC methods are limited to invoice creation/lookup. This
  review did not create invoices or move funds.
- Live app runs under the persistent bitcoinwalk user service; payment database
  and supplied environment file are mode 0600, state directory 0700. The effective
  environment-file path is recorded in the current runbook. Broader host access
  and secret-rotation review remain separate.

## Housekeeping and validation

Removed six obsolete app installers, two rejected-release manifests and five
text-only assertions for rejected installers. Files remain recoverable from Git
and the pre-change backup. Corrected directory/packaging tests remain. Other
historical scripts remain where tests or operational references still depend on
them; no live release directory or backup was deleted.

Excluded generated release/backlog/map assets from source lint and removed one
unused import. Lint now reports six existing image warnings and no errors, rather
than 1,132 mostly generated warnings. Replaced the obsolete root-based staging
runbook with the verified non-root procedure and added a compact handover.

Web: 461/461 tests across 100 files (previously 466; five obsolete installer
assertions retired). Typecheck, build and package validated. Relay: 118 top-level
tests passed across four packages, zero failures; vet passed. Local web checks
used Node 26; GitHub CI is the Node 24 runtime validation gate.

## Backlog and synchronization

At review start the maintained web checkout matched GitHub `a86ae3e`; GitHub's
CI and Pages workflows passed. The public backlog contained BW-81; GitHub Issues
had no open items. The maintained Markdown is authoritative, not an issue mirror.
BW-61's outdated next step was reconciled with accepted backfill/restart evidence
and the user's pause. BW-53 gained the concrete launch configuration/security gates.

Relay was behind GitHub: fast-forwarded `00d52d4` to `2ca89b6`, then published that
same head via ngit successfully. Some optional Nostr announcement relays failed;
the ngit state publication and both Git hosting mirrors succeeded. Web ngit was
also behind (`e3f115f`); final housekeeping publication is verified separately.

Resume with `development-handover.md`, then the relevant design and backlog rows.
This compresses working context into a maintained file; it does not erase or
claim to rewrite the existing chat history.
