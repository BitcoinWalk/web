# BW-152 production rollout candidate

This is a preparation bundle, not an installer. Do not copy its files over the
running service until the production web prerequisite and rollback are verified.
It contains no credentials, conversations, service configuration or send artifact.

## Accepted evidence

- Staging Basic: three replies, fourth blocked, reset 86400 seconds after third
  acknowledgement, duplicate retry counted once; five Pro replies allowed.
- Seven synthetic topic checks passed on gpt-6.1-sol. Drafts reviewed separately.
- Worker build and focused reply/allowance/access/evaluation tests passed.

## Deployment order

1. Promote the reviewed web release containing `/api/guide-support-access` to
   production using the guarded production deployment helper. Preserve the real
   Guide identity. Do not copy the staging-only policy test public key.
2. Verify a signed read-only plan lookup using the real Guide identity against
   the configured production loopback origin (port 3345). Verify one Basic and
   one currently entitled Pro recipient; do not infer plans from requested tiers.
3. Check this bundle's SHA256SUMS and compare installed worker, sender and
   knowledge hashes with the baseline below. Stop if they differ.
4. During a brief maintenance window, stop the Guide worker, take a root-private
   consistent backup of its complete state directory and installed artifacts,
   and record the active web release and unchanged service configuration.
5. Install the worker and reviewed sender as root-owned executables, and the
   public knowledge snapshot as root-owned readable data. Restart and verify
   healthy scans. Preserve all existing Guide credentials and support settings.
   Do not add an OpenAI key, AI environment, timer or automatic reply path.
6. Verify existing case counts and legacy acknowledgement IDs remain intact.
   Generate a new draft only on explicit operator action with a temporary key.
   Review its text and exact message snapshot before authorizing a single send.
7. Confirm the reviewed reply appears in BitcoinWalk chat and an external client.
   A relay acknowledgement alone is not a read receipt.

## Baseline observed 4 November 2026

- Worker: f196564cf937c61129ff87f5a7359818410d3c3552fd3ebfeae1f6654ef1d297
- Reviewed sender: ced029e955c32685d1f4c6dda128f3a15d3910ea29dcd253f5a91cfbc0ab2205
- Knowledge: c6c6313bc71bd8382c821738f9bb356f1d562ff3e8784670481055c5be08b973

## Rollback

Before any new reply is sent, stop the worker and restore the matched artifact
and database backup, then restart and verify. After any delivery, do not restore
a stale database: it can erase acknowledgement records and cause duplicate sends.
Pause reviewed sending and reconcile delivery records before rollback. Keep the
compatible web plan-verification endpoint available while the new sender is used.

Pro removes the Basic cooldown, not human review. Off-topic responses remain
Bitcoin-only redirects; financial, identity and recovery changes need human review.
