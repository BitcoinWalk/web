# Chat image storage

The chat upload store has a **2 GB (2,000,000,000 bytes)** payload budget and a
**90-day protection period**. Cleanup runs during admission of a new image,
not on a periodic timer. Images older than 90 days remain available while there
is sufficient capacity.

At capacity, the store removes the oldest eligible files until the new image
fits. All recorded chat references to a file must be older than 90 days. A new
share restarts protection for that file. Any recorded non-chat reference
(including a walk or city image) prevents deletion. The exact 90-day boundary
is still protected. If there is not enough eligible space, the new upload fails
without intentionally evicting a partial set of otherwise eligible images.

The budget counts actual file sizes, once per content hash, rather than claimed
upload sizes. Files shared with chat count toward its budget even when another
media record prevents their deletion. Untracked files are conservatively
counted and never automatically deleted. Unrelated, tracked non-chat images
are excluded. The budget does not include other media categories, filesystem
overhead, backups, or client/CDN caches.

Chat metadata is additionally limited to 100,000 records. Failed attempts
remain for the rolling one-hour rate-limit window and are then pruned on a
subsequent upload. Successful records are removed with eligible files under
byte-capacity pressure; recent quota evidence is never evicted. Reaching the
record limit alone pauses new uploads for operator maintenance; it does not
authorize image deletion below the 2 GB threshold. Existing hourly and
processing limits remain in place.

## Operational safeguards

- The shared manifest lock serializes **all** media writers across processes.
  Busy requests fail safely; the lock is never stolen based on age.
- After a process crash, a leftover `manifest.lock` directory may require
  operator recovery. Stop all writers sharing that media root, verify that no
  process still owns the operation, review the manifest/files, and only then
  remove the empty lock directory before restarting.
- Invalid or unreadable manifests block writes rather than resetting storage
  accounting. Restore or repair them before retrying. A missing manifest does
  not authorize deletion of existing untracked files.
- An interrupted write may leave an untracked image. It is charged to the
  budget but requires operator reconciliation, not automatic deletion.
- Removed origin files cannot be recovered through the application; any
  recovery depends on separately managed backups. Old conversation references
  may return 404. Previously cached copies can remain visible until cache
  expiry; this is a capacity policy, not a secure-erasure guarantee.

This policy does not establish chat membership authorization. The separate
web/relay membership-check rollout must be completed before that security
finding can be closed. Deploying this code can delete eligible old images when
new uploads need capacity; verify backups and rehearse on staging first.
