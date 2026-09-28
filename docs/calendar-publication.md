# Calendar publication and external discovery — 29 September 2026

The legacy `/admin/calendar` screen has been retired into the unified organizer
**Walks** screen. Organizer-owned kind-31923 publication, exact BitcoinWalk-relay
read-back, stable occurrence addresses, updates and signed cancellations are already
deployed. The 29 September BW-10 increment adds bounded public discovery fanout without
changing the signed event or treating a third-party relay as authoritative.

The default discovery transports are `wss://relay.ditto.pub/` and
`wss://relay.primal.net/`. A read-only audit found that the existing Memphis events
were not present on Bucket, nos.lol, Ditto, Primal or nostr.land. The exact valid
organizer-signed Memphis occurrence for 10 October 2026 was then published unchanged
to the candidates: Ditto and Primal both acknowledged it and returned the exact signed
ID; nos.lol failed to connect and is not a default; Bucket retains events for only
30 seconds; and nostr.land advertises payment-required writes.

## Human acceptance

1. Connect an approved city organizer and open `/admin/walks`.
2. Publish one future walk or press **Retry public discovery** on an existing future
   organizer-owned walk. A retry republishes the identical signature and does not ask
   the signer to create a new event.
3. Expect exact BitcoinWalk-relay read-back plus a per-relay discovery result. One
   public relay failing must not conceal successful authoritative publication.
4. Open the generated event link. Its `nevent` hints include the BitcoinWalk relay,
   Ditto and Primal, while the BitcoinWalk server continues to ignore untrusted hints.
5. Find the event in Satlantis and Club Orange. This human client check remains the
   final BW-10 acceptance gate because NIP-52 does not define global relay discovery.
6. Edit the walk and verify clients select the replacement at the same NIP-52 address.
7. Cancel it and verify the organizer-signed NIP-09 event is delivered and read back
   on both discovery relays. Third-party clients may retain cached copies.

## Scope and limitations

- Recurrence is expanded to separately signed kind-31923 occurrences; NIP-52 itself
  intentionally does not define recurrence.
- Only the exact current approved revision and approval are accepted. Pending edits do not replace the approved snapshot.
- Rescheduling keeps the occurrence `d` address and creates a new signed revision.
  An old `nevent` ID can become unavailable; it is never silently rewritten.
- Revoked/stale events are filtered on our relay reads. Already fetched third-party copies cannot be recalled by this policy; cancellation/deletion propagation remains future work.
- Production hostname and relay cutover remain BW-53.
- Untrusted nevent relay hints are not fetched by the web server.
- This slice changes no chat service, DNS, Caddy, relay credentials or legacy website.

Automated coverage now checks exact per-relay acknowledgement/read-back, partial
failure reporting, retry safety, invalid configuration and multi-day `D` tags. The
release package must contain the managed staging relay plus both discovery relays.
Final staging acceptance still requires the organizer/client steps above.
