# BitcoinWalk sponsorships

BW-16 provides presentation and super-admin control. It intentionally does not
claim that a sponsor has paid. Zap-funded booking and receipt verification are
separate under BW-89.

## Signed model

Sponsorship assignments are retained, super-admin-signed records in the existing
approved admin-record kind, isolated by the `bitcoinwalk-sponsorship` namespace.
They target either a city UUID or a city UUID plus stable NIP-52 occurrence
address. Each revision links to its predecessor and records one explicit mode:

- `hidden`: render nothing;
- `empty`: show the invitation to sponsor;
- `sponsor`: show the sponsor npub and approved website;
- `inherit`: walk-only reset to the city assignment.

An optional start/end interval makes an expired sponsor become an open sponsor
slot rather than silently falling back to a different advertiser. The global
Sponsorships feature flag is fail closed: missing, unreadable or disabled state
hides every module without deleting assignments.

## Resolution

1. Global flag off: hidden.
2. An explicit walk assignment wins over the city assignment.
3. A walk in `inherit` mode uses the city assignment.
4. A city with no assignment remains hidden.
5. `empty` shows “Would you like to sponsor this or a future walk?”
6. `sponsor` shows **Sponsored by**, the reusable Nostr profile card, and the
   approved website link when present.

“Clear sponsor” signs an `empty` revision. “Hide” signs a `hidden` revision.
“Use city sponsor” signs an `inherit` revision. No audit record is deleted.

## Profile and website safety

The sponsor identity is a Nostr public key. The admin UI can read `website` from
the sponsor's signed kind-0 profile (NIP-24 metadata), but it accepts only a
public HTTPS URL without credentials, local names, IP literals or non-standard
ports. The reviewed URL is copied into the signed assignment. Public rendering
does not let a later profile edit silently redirect the approved sponsor link.

## Future commercial packages

BW-89 will add Lightning-zap booking and verifiable NIP-57 settlement. BW-90
will define fixed, transparent packages: one-walk Spotlight, a time-bounded city
Patron slot, and prepaid 3/6/12-walk series discounts. Optional directory and
post-walk acknowledgements require independent placement flags. BitcoinWalk
will not use behavioural targeting, tracking pixels, takeover ads, sponsor
control over editorial content, or any sponsor private key.
