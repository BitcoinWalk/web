# BW-108 — migrate existing paid (MEP)

Planned, 8 October 2026. No live identity, ownership or payment changes authorized by this planning document.

## London outcome

The organizer already controls the dedicated identity:
`npub1fwjs03fsya8z0xdp6fwjgyvn0cr68gup3x6nv2gw7efj2x75y4wsf0h7aa`.

Every `/london` page, including historical and future event routes, must display this identity in the organizer/Hosted by presentation. Reuse the existing account; no new key, city or Pro purchase. Preserve existing profile fields unless the organizer approves changes. Apply the same resolver to profile links, copy controls, accessible labels and rendered organizer metadata. Never fall back to the personal organizer if the branded profile cannot load: use the city identity with a safe name/avatar fallback.

This is presentation privacy, not deletion of public Nostr provenance. Historical event authors, signatures, IDs and nevent URLs stay unchanged. Any explicitly exposed event-author provenance must be distinguished from the current host, not misrepresented as newly signed by the city identity.

## Separate checkpoints

1. **Preflight:** resolve London's stable city ID, current owner from the anchored directory, approval, paid entitlement, existing brand binding and restrictions. Verify the supplied npub and prove control in the organizer's signer. Do not infer ownership from profile name or NIP-05.
2. **Public identity:** obtain current-owner authorization and dedicated-key proof, then the existing super-admin binding approval/publication and exact relay read-back. Complete BW-106's shared host resolver and verify every London route, including historical nevent pages. This can deliver the requested display without transferring ownership.
3. **Explicit ownership transfer:** the user also requested transferring ownership. Prepare a separate reviewed directory successor, signed by the current owner and bound to the current predecessor, with the dedicated identity as new owner. Require proof/acceptance from the destination key before publication. The existing rotate protocol preserves operators, recovery and endpoints; review these separately rather than silently altering them. Audit creator/editor grants, CMS permissions, relay publishing and payment authority so a directory change does not falsely claim all access has moved. Preserve immutable creator/history records; any remaining legacy access must be disclosed and resolved by an explicit policy. Verify both directory transports and effective permissions.
4. **Owner equals brand exception:** current standard setup rejects identical owner and brand keys. Before checkpoint 3, design and implement a versioned, explicitly authorized MEP path across setup, binding validation, relay admission and recovery. Re-attest against the new ownership snapshot; ownership rotation invalidates prior setup confirmations. Do not globally remove the distinct-key guard, reuse stale proofs or leave the public binding silently invalid after rotation. Block transfer until this end-to-end path is ready.
5. **NIP-05 and Lightning:** map `london@bitcoinwalk.org` to the verified dedicated pubkey. Separately validate the organizer's private personal Lightning payout destination and the durable 79/21 configuration. The public city address is not the private 79% destination; reject self-referential payout loops. Reconfirm payout authority after ownership rotation. Preserve already issued invoice obligations and paid entitlement.
6. **Profile update and acceptance:** after endpoint checks pass, organizer signs a field-preserving city profile update with `nip05` and `lud16` set to `london@bitcoinwalk.org`. Verify profile read-back, NIP-05 resolution and Lightning recipient/split before reporting those capabilities active. No server-side key custody. Retain resumable state and audit evidence for each checkpoint; failed retries must not double-provision or create new invoices.

Checkpoint 2 is the immediate public-display goal. Checkpoints 3–4 are a separate actual transfer, not necessary just to change Hosted by. Endpoint/payment work remains gated by BW-18/BW-19; configuring a profile string alone does not activate it. Keep ordinary Pro onboarding's personal-owner/separate-brand model unchanged.

## Acceptance tests

- London landing page, all existing London event URLs and future walks consistently show the exact dedicated npub, including copy value and profile links; no personal-profile fallback on network failure.
- Wrong owner, wrong destination key, expired proof, stale directory predecessor and replay are rejected. MEP cannot be selected by an editor or donor to take ownership.
- Transfer preserves city ID, slug, aliases, entitlement, historical events and URLs. Destination identity can manage London after transfer; old-account rights match the explicitly approved policy.
- Standard distinct-key onboarding still passes. MEP binding remains valid after transfer and restart, with exact read-back and retry recovery.
- NIP-05 targets the dedicated key; city Lightning address routes through verified 79/21 configuration to the separate personal destination. No new purchase and no change to outstanding invoice obligations.

## Organizer instructions

Before migration: keep both the current owner identity and the dedicated London identity available in your signer, with private recovery backups. Do not send private keys or bunker secrets. Do not create another city/account or pay another invoice.

When we send the prepared request: use the existing owner to authorize London's identity binding and, separately, the reviewed ownership transfer. Use the dedicated London identity to prove control/accept the migration. The current normal upgrade screen is not yet the MEP transfer flow; wait for the prepared instructions rather than generating another identity.

Privately confirm the personal Lightning address that should receive your 79% share. This must not be `london@bitcoinwalk.org`.

After we confirm the endpoints are ready: select the dedicated London identity in your Nostr client and set both NIP-05 and Lightning address to `london@bitcoinwalk.org`. Save/sign the profile update; preserve your existing name and avatar unless you want to change them. Check all London pages show the dedicated identity and, following an actual transfer, that it can manage London in the dashboard. Keep the old key for any historically authored events that may still require its signature.
