---
title: Manage your city and walks
description: Use the BitcoinWalk dashboard without handing over your Nostr identity.
---

BitcoinWalk calls the person responsible for a city its **city host**. Someone invited to run one particular occurrence is a **walk host**; that invitation does not grant control of the city or its other walks.

## Connect the right account

Open the BitcoinWalk dashboard and connect the Nostr identity that owns or edits the city. The account avatar remains visible in the upper-right menu so you can confirm the active identity before signing.

BitcoinWalk supports a browser signer, a local identity and compatible remote signers. Never send anyone an `nsec`, a signer connection secret or an identity backup.

## City profile

Use **Cities** to update the public city description, default meeting point and hero image. A submitted edit remains pending until it receives the required approval. Do not place private contact or payout details in public profile fields.

## Walks

Use **My walks** to review drafts and published dates. The filters provide:

- **All:** every available state;
- **Next Walk:** the nearest published walk for each city;
- **Upcoming:** all future published walks; and
- **Past:** completed walks.

Recurring plans prepare individual Nostr calendar events. Review the dates, local time, meeting place and description before signing. Cancel or edit the exact walk rather than creating a duplicate date.

## Signing and approval are different

Your signature proves who requested a change. It does not automatically make a pending city public, activate a relay or establish a paid entitlement. The dashboard shows those steps separately.
