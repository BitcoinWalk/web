# Super-admin Basic-to-Pro promotion

This procedure grants the normal lifetime Pro onboarding workflow to an already approved Basic city. It is for an explicit administrative decision such as a partnership, credit or manually verified off-platform payment.

It does **not** create a Lightning invoice, claim that a Lightning payment settled, choose the organizer's payout destination, create or hold the city signer, or activate public Pro services before their normal verification gates pass. The durable record is labelled `admin-pro-promotion-v1`, has a zero amount, and retains the signed super-admin grant as its audit evidence.

## Included Pro bundle

The signed grant is not a partial upgrade. It binds `bitcoinwalk-lifetime-pro-v1`, the current 79% organizer / 21% BitcoinWalk split, and all of these capabilities:

- branded **BitcoinWalk in City** identity and public profile;
- verified `city-slug@bitcoinwalk.org` NIP-05 identity;
- the same public `city-slug@bitcoinwalk.org` Lightning address, backed by verified LNURL-pay and NIP-57 receipts;
- the organizer's private, owner-signed Lightning address or LNURL-pay payout destination for the 79% share;
- city profile artwork, public share artwork and downloadable city logo pack;
- the dedicated Pro city relay and Armada/Concord community, alongside the ordinary shared Walkie Talkie channel; and
- the Overview next-action journey and BitcoinWalk Guide NIP-17 onboarding sequence.

The public city address and private organizer payout destination are deliberately different. The promotion includes the right and workflow to configure both; it never invents or copies a private payout destination. Public LNURL invoice issuance remains disabled until the organizer confirms the destination, connects a recoverable city signer (or reuses an owner account already publicly named **BitcoinWalk in &lt;city&gt;** after two-relay verification), submits both activation proofs, the super-admin publishes the exact city binding, and the provisioning worker independently verifies NIP-05, LNURL-pay and the 79/21 configuration.

## Preconditions

- Deploy the app release containing this operation before running it. Do not run a new database writer against an older application schema.
- Confirm the city is the current approved canonical city on the target environment and has current signed owner authority.
- Confirm the city has no payment invoice, paid entitlement, Pro setup task or prior administrative promotion. A city with any such history needs a separate reconciliation, not this operation.
- Confirm the city and organizer are not suspended and record a concise operational reason for the grant.
- Use the target environment's exact database and relay. Staging and production must not be mixed.
- Keep the super-admin signer off the server. Only an unsigned template and the resulting public signed event move between the server and signer.

## Build the operator tool

From the reviewed source release:

```sh
npm run admin-pro-promotion:build
```

Transfer `release-build/promote-basic-city-to-pro.cjs` through the normal reviewed release path. Run it as the unprivileged `bitcoinwalk` account, never as root.

## 1. Prepare the exact grant

Run this on the target host for the target environment:

```sh
node promote-basic-city-to-pro.cjs --template \
  production \
  CITY_UUID \
  "Approved partnership: reference TICKET"
```

For staging, replace `production` with `staging`. The tool reads the target
environment's authoritative application relay, then produces a 15-minute
kind-27235 template from the current approved revision, approval and owner
authority. Endpoint-directory relays are deliberately not used here: they carry
signed city endpoint roots, not the city workflow records required by this
authorization check. The template also names the complete Pro bundle, every
included capability and the 79/21 policy. Save the output without editing it.

Sign that exact template with the configured BitcoinWalk super-admin Nostr identity on a separate trusted signer. Save the complete signed event JSON to an owner-readable file on the target host. Do not copy an `nsec` or signer session to the server.

If the grant expires, the approval changes or ownership rotates, discard it and prepare a new template.

## 2. Verify without changing state

Production:

```sh
node promote-basic-city-to-pro.cjs --verify-only \
  production \
  /home/bitcoinwalk/incoming/admin-pro-signed-event.json
```

Staging:

```sh
node promote-basic-city-to-pro.cjs --verify-only \
  staging \
  /home/bitcoinwalk/incoming/admin-pro-signed-event.json
```

Continue only after `ADMIN_PRO_PROMOTION_VERIFY_OK`. Verification is read-only. It checks the signature, exact tags and payload, expiry, current approval and ownership, database shape, and absence of conflicting payment/setup history.

## 3. Apply once

Repeat the same command with `--apply`. Example for production:

```sh
node promote-basic-city-to-pro.cjs --apply \
  production \
  /home/bitcoinwalk/incoming/admin-pro-signed-event.json
```

The operation creates an online SQLite backup under `/home/bitcoinwalk/backups/` before opening its transaction. It then atomically records:

- the full signed grant, complete Pro bundle, capability list, 79/21 policy and reason in `admin_pro_promotion`;
- a zero-amount, paid-status audit row whose source is `admin-pro-promotion-v1`;
- the ordinary city entitlement; and
- a pristine `setup-required` Pro setup task for the current owner.

An exact retry is idempotent and reports `created=false`. Any partial, different or pre-existing history is refused. The tool has no downgrade or revoke mode.

An exact retry of a fully installed promotion remains readable after the
15-minute signing window has elapsed. This is acknowledgement recovery only:
the stored grant, zero-amount audit row, entitlement and setup-task binding must
all match byte-for-byte, and the retry performs no write. An expired grant that
was never installed is still refused, as is any partial or conflicting history.

## 4. Confirm the organizer handoff

After the application and Guide workers have reconciled:

1. Sign in as the current organizer and confirm **Next required action** appears in Overview.
2. Confirm the city is labelled Pro and the plan panel says **Pro access granted by BitcoinWalk**, not **Payment verified**.
3. Confirm the first unfinished step is **Confirm your payout destination**.
4. Confirm BitcoinWalk Guide sends the matching encrypted city-scoped NIP-17 message once. The message must contain no destination, proof or secret.
5. Let the organizer complete the normal owner-controlled sequence: payout confirmation, city signer selection, recovery acknowledgement, activation proofs, super-admin review and publication. The signer may be separate, or the existing owner identity when its signed public profile is already named exactly **BitcoinWalk in &lt;city&gt;** and can be read from at least two profile relays.
6. Confirm independent read-back reports both NIP-05 and Lightning/LNURL active, and that the public city profile publishes the verified `nip05` and `lud16` values.
7. Confirm a city Lightning invoice binds the current organizer payout version and 79/21 policy before authorizing any bounded live payment check.
8. Confirm the dedicated city relay and Armada community are verified, while Walkie Talkie remains independently available on the shared relay.
9. Confirm the city logo pack, generated profile artwork, public paid-city presentation and organizer controls are available.
10. Confirm the next-action card and Guide message advance with the setup state and disappear only after verified activation.

The promotion makes the city eligible for the existing provisioning reconcilers; it does not bypass their current authority, moderation, signer, payout or read-back checks.

## Acceptance record

Record the source commit and app release, environment, city ID/name, current owner npub, revision/approval/authority event IDs, signed grant event ID, bundle/capability digest, reason or ticket, verification result, backup path, apply result, organizer Overview result, Guide delivery result, NIP-05/LNURL read-back, 79/21 configuration version, relay/community evidence and final setup state. Never record the private payout destination, signer secrets or NIP-44 plaintext.

If any post-apply check is wrong, stop the workers that could advance the setup, preserve the database and backup, and investigate. Do not delete the entitlement or restore an older database over newer writes without a reviewed reconciliation plan.
