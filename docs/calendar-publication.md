# Calendar publication and external discovery — 29 September 2026

The legacy `/admin/calendar` screen has been retired into the unified organizer
**Walks** screen. Organizer-owned kind-31923 publication, exact BitcoinWalk-relay
read-back, stable occurrence addresses, updates and signed cancellations are already
deployed. The 29 September BW-10 increment adds bounded public discovery fanout without
changing the signed event or treating a third-party relay as authoritative.

The default discovery transports are `wss://relay.ditto.pub/`,
`wss://relay.primal.net/` and `wss://relay.satlantis.io/`. A read-only audit found that the existing Memphis events
were not present on Bucket, nos.lol, Ditto, Primal or nostr.land. The exact valid
organizer-signed Memphis occurrence for 10 October 2026 was then published unchanged
to the candidates: Ditto and Primal both acknowledged it and returned the exact signed
ID; Satlantis also accepted and returned that exact event during the failed client-discovery investigation; nos.lol failed to connect and is not a default; Bucket retains events for only 30 seconds; and nostr.land advertises payment-required writes. The old Memphis event had coordinates only in a `location` tag. App 0.3.83 adds a standard nine-character `g` geohash to every newly signed event so geographic indexes can place it. Existing signatures cannot be changed, so an organizer edit is required to replace an older event with the compatible payload.

The first 0.3.83 Memphis edit correctly failed closed because staging relay 0.8.53
did not yet allow `g`. Relay policy 0.8.54 validates that an optional single `g`
tag exactly matches the signed coordinates and keeps pre-migration events without it
readable. The web interface first reports the authoritative BitcoinWalk result (1/1);
only after that succeeds does it publish and report the three public discovery relays
(3/3).

Staging acceptance on 29 September installed relay 0.8.54 and produced Memphis
replacement event `dcf95bb77e935f2de5ec8ba73a137e6af55a5c088cdf52779fd2426af44f9cc2`
with geohash `9ypzzjdhe`. Ditto acknowledged the first fanout before exact-ID read-back
was available, so the UI correctly reported 2/3 and retained the failure reason. A
manual retry reused the exact signature and reached 3/3; an independent query then
verified that exact valid event and geohash on Ditto, Primal and Satlantis.

## Human acceptance

1. Connect an approved city organizer and open `/admin/walks`.
2. Publish one future walk or press **Retry public discovery** on an existing future
   organizer-owned walk. A retry republishes the identical signature and does not ask
   the signer to create a new event.
3. Expect exact BitcoinWalk-relay read-back plus a per-relay discovery result. One
   public relay failing must not conceal successful authoritative publication.
4. Open the generated event link. Its `nevent` hints include the BitcoinWalk relay,
   Ditto, Primal and Satlantis, while the BitcoinWalk server continues to ignore untrusted hints.
5. Find the event in Satlantis and Club Orange. This human client check remains the
   final BW-10 acceptance gate because NIP-52 does not define global relay discovery.
6. Edit the walk and verify clients select the replacement at the same NIP-52 address.
7. Cancel it and verify the organizer-signed NIP-09 event is delivered and read back
   on all discovery relays. Third-party clients may retain cached copies.

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
failure reporting, retry safety, invalid configuration, geographic `g` tags and multi-day `D` tags. The
release package must contain the managed staging relay plus all three discovery relays.
Final staging acceptance still requires the organizer/client steps above.
