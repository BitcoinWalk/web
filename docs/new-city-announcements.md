# Review-gated new-city announcements

BW-50 prepares a public kind-1 Nostr announcement only after BitcoinWalk can verify the approved city, its exact organizer-signed first walk, the walk's city-local timezone and a signed two-letter country code.

## Safety boundary

- City search supplies the country code and the organizer signs it into the city record. Editing the city name after selection clears that evidence until a search result is selected again.
- The first walk uses the timezone derived locally from its approved coordinates, never the phone timezone.
- After the activation checklist finishes with every item green or not applicable, the approval modal renders the complete post and offers **Sign and announce** or **Skip announcement**. City approval never signs or publishes an announcement by itself.
- Skipping closes the approval journey without changing the accepted city. The same candidate remains available under **New-city announcements** for later review or interrupted-delivery recovery.
- `NEXT_PUBLIC_ANNOUNCEMENT_RELAYS` has no default. `NEXT_PUBLIC_ANNOUNCEMENT_NOT_BEFORE` must also be a ten-digit Unix timestamp. Without both, review remains visible and publishing is disabled.
- The rollout cutoff excludes approvals created before activation, preventing a historical-city announcement flood.
- The event binds the exact city revision, approval and first-walk IDs, country, city ID and canonical production URL.
- Before signing, the app checks configured relays for an existing super-admin announcement for that city. An existing event suppresses another post.
- After signing, the exact event is retained in origin-scoped browser storage until every configured relay acknowledges it and returns the same verified event ID. Partial success names the failed relays and retry reuses the original signature.

## Staging acceptance

1. Leave both announcement variables unset.
2. Approve a new fixture city from **Requests** with the super-admin signer and finish its rollout checklist.
3. Confirm the same modal shows the exact copy, flag, local date/time and canonical production URL beneath the completed checklist.
4. Confirm **Publishing disabled** remains disabled while **Skip announcement** completes the approval journey without changing the accepted city.
5. Confirm the skipped candidate remains available under **New-city announcements** for later action.
6. Confirm a legacy city is never publishable when a rollout cutoff is configured after its approval.

## Production activation

Set a reviewed relay list and rollout cutoff in the production build only after staging acceptance. Approve a genuinely new city after that cutoff, review the prepared copy, then sign it separately. Record the exact event ID and independent read-back from every configured relay. A failed destination must leave the same signed event available for retry; do not sign a replacement.
