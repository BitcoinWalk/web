# BW-61 — owner-controlled relay endpoint migration

Status: 🟠 in progress. BW-60 established who controls the signed directory and how clients resolve it. BW-61 changes an endpoint without weakening that trust chain, silently redirecting the replication registry or making the old endpoint unavailable before rollback is proven.

Checkpoint reconciled 2 October 2026: **paused by the user**, not awaiting initial
candidate provisioning. Candidate 0.8.48 at `wss://replica.bitcoinwalk.org/`
passed visible-state backfill acceptance 0.8.51 (exact Memphis 7/7, hidden history
excluded), then 0.8.52 backup and repeated restart with read-only root, hardened
tmpfs and no published host ports. Evidence: source
`/var/backups/bitcoinwalk-replica-visible-acceptance-complete.tPPqL1`; candidate
`/var/backups/bitcoinwalk-replica-candidate-post-backfill.xTOlEI`.
Registry and signed directory remain unchanged. Resume with fresh read-only
preflight and explicit migration review, not another empty reset or backfill.

The expected BitcoinWalk production candidate is `wss://replica.bitcoinwalk.org/`. That name is not considered active merely because DNS or TLS exists. An owner-operated domain may replace or accompany it; BitcoinWalk naming is optional and does not confer ownership.

## Safety boundary

Migration is additive and has five separate decisions:

1. **Add:** provision a candidate receiver without altering the signed directory or current replication destination.
2. **Verify and sync:** prove public TLS, NIP-11 identity, receiver write policy, exact signed-event equality, private-wrapper exclusion and independent failure behaviour.
3. **Switch:** after backup and explicit owner review, append one signed directory successor and require exact read-back from every directory transport.
4. **Soak:** retain the old endpoint and continuously compare exact public state while clients adopt the successor.
5. **Retire:** remove the old destination only through a separate confirmation after the soak and rollback test pass.

The existing replication registry correctly rejects an in-place destination redirect. BW-61 must introduce an explicit migration state; it must not relax that check. Payment and entitlement identity remain unchanged when an endpoint moves.

## Read-only preflight contract

`assessCityEndpointMigration` is the first implementation slice. It cannot sign or publish an event. It reports readiness for human successor review only when all gates pass:

- exact immutable city UUID and current signed-endpoint binding;
- a distinct normalized root WSS candidate;
- read-only evidence from both endpoints;
- the same non-empty, sorted, duplicate-free occurrence IDs;
- valid signatures and zero private wrappers;
- candidate TLS, NIP-11 and receiver write-policy verification;
- unanimous current-chain resolution across all directory transports;
- operator-confirmed failure-domain separation;
- SHA-256 evidence for registry, journal and receiver rollback artifacts;
- no `-staging` hostname in a production candidate.

Any failed gate blocks successor review. Passing preflight does not authorize signing, DNS changes, registry mutation or retirement.

## Required acceptance evidence

- candidate receiver backup and reproducible installation;
- exact source/current/candidate equality before signing;
- negative receiver-policy probes that leave candidate state unchanged;
- current directory root and chain captured from both transports;
- explicit owner review of the exact successor template;
- all-transport acknowledgement and exact-ID read-back;
- old and new endpoints readable throughout the soak;
- restart, temporary outage and rollback rehearsals;
- a production artifact scan with no staging hostname;
- explicit retirement confirmation after the soak.

Private chat, DMs, Lightning, Alby Hub, NWC and payment verification are outside this migration.
