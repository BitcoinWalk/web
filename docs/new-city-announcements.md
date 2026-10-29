# Review-gated new-city announcements

BW-50 prepares a public kind-1 Nostr announcement only after BitcoinWalk can verify the approved city, its exact organizer-signed first walk, the walk's city-local timezone and a signed two-letter country code.

## Safety boundary

- City search supplies the country code and the organizer signs it into the city record. Editing the city name after selection clears that evidence until a search result is selected again.
- The first walk uses the timezone derived locally from its approved coordinates, never the phone timezone.
- After the activation checklist finishes with every item green or not applicable, the approval modal renders an editable post and offers **Sign and announce** or **Skip announcement**. The super-admin may rewrite the copy, while the canonical event link remains required. City approval never signs or publishes an announcement by itself.
- Skipping closes the approval journey without changing the accepted city. The same candidate remains available under **New-city announcements** for later review or interrupted-delivery recovery.
- Staging gives `NEXT_PUBLIC_ANNOUNCEMENT_RELAYS` no default and requires `NEXT_PUBLIC_ANNOUNCEMENT_NOT_BEFORE` to be a ten-digit Unix timestamp. Without both, review remains visible and publishing is disabled. Production uses only the reviewed source-pinned policy recorded below.
- The rollout cutoff excludes approvals created before activation, preventing a historical-city announcement flood.
- The event binds the exact city revision, approval and first-walk IDs, country, city ID and canonical production URL.
- Before signing, the app checks configured relays for an existing super-admin announcement for that city. An existing event suppresses another post.
- After signing, the editor locks and the exact customized event is retained in origin-scoped browser storage until every configured relay acknowledges it and returns the same verified event ID. Partial success names the failed relays and retry reuses the original signature and edited copy.

## Staging acceptance

1. Leave both announcement variables unset.
2. Approve a new fixture city from **Requests** with the super-admin signer and finish its rollout checklist.
3. Confirm the same modal shows the exact copy, flag, local date/time and canonical production URL beneath the completed checklist.
4. Confirm **Publishing disabled** remains disabled while **Skip announcement** completes the approval journey without changing the accepted city.
5. Confirm the skipped candidate remains available under **New-city announcements** for later action.
6. Confirm a legacy city is never publishable when a rollout cutoff is configured after its approval.

## Production activation

Set a reviewed relay list and rollout cutoff in the production build only after staging acceptance. Approve a genuinely new city after that cutoff, review the prepared copy, then sign it separately. Record the exact event ID and independent read-back from every configured relay. A failed destination must leave the same signed event available for retry; do not sign a replacement.

Release `0.3.521` activates the reviewed production configuration at exact source
`e355884dfcf64a7b8bc8fd3f4fdb8aa6f8b2a966`: Damus and Primal are the two
announcement destinations and `1792886400` (25 October 2026 00:00 UTC) is the
rollout cutoff. The build contains no staging relay hostnames and packaging now
rejects them explicitly. Staging and production retain the accepted BW-138
sponsor lifecycle through the same reconciled ancestry. Staging evidence is
`/home/bitcoinwalk/backups/app-staging-deploy.kLXsgl`; production evidence is
`/home/bitcoinwalk/backups/app-production-deploy.Y0Aekm`. Activation published
nothing. One post-cutoff city announcement and partial-delivery retry remain the
acceptance gates.

Production `0.3.557` later exposed a build-time regression: the announcement UI
remained present but the reviewed cutoff was absent from the browser bundle, so
the signing action correctly failed closed. Hotfix `0.3.565` pins the accepted
Damus/Primal destinations and `1792886400` cutoff in source for production only;
staging still has no default. Production packaging now rejects any bundle missing
either destination or the cutoff, including its compiler-optimized hexadecimal
representation. Guarded activation evidence is
`/home/bitcoinwalk/backups/app-production-deploy.9PPF21`; the release archive is
SHA-256 `33893ac3c98a68ffe16762da1d32c862605d4e45e05794c4bb247eb0e1383477`.
Deployment published no announcement.
