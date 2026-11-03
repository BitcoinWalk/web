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

### Add next week’s walk

1. Connect the account that owns or edits your city and open **My walks** in the dashboard (`/admin/walks`). Check **Upcoming** first to avoid adding a date that is already published.
2. Select **+ Add a walk** and choose your city. Review the description and meeting point. Changes in this form apply to this walk, rather than changing the city profile.
3. Select **Continue to schedule**. For a single walk, choose **Does not repeat**, set **Walk date** and **Start time** using the city’s local time zone. For a recurring series, choose **Every week** or **Every two weeks**, the weekday, starting date and time.
4. Select **Preview occurrences**. Review the dates and meeting points and select the occurrences you want to publish. A recurring preview prepares the next eight dates; it does not publish them automatically.
5. Select **Continue to sign**, then **Sign and publish selected**. Approve the request in your signer if prompted, and check the publication result and the **Upcoming** list.

If the city is missing or publishing is paused, confirm the connected account and refresh permissions before trying again. Do not create another city to work around missing access.

### Ask someone else to host one walk

The city host can delegate an upcoming published walk to a colleague:

1. Find the exact walk in **My walks** and select **Delegate this walk**.
2. Enter the colleague’s public key in **Colleague’s npub**. Check the displayed identity, then select **Invite to host this walk** and approve the invitation in your signer if prompted.
3. The colleague receives a private invitation. If delivery is incomplete, use **Copy link** to share the acceptance link privately or **Send / retry DM** to retry the same invitation.
4. Ask the colleague to open the acceptance link and accept using the invited Nostr account. Until the status changes from **Awaiting acceptance** to **Accepted — colleague is hosting**, the invitation has not been accepted.

The colleague’s hosting identity becomes public for that occurrence. Delegation grants no city editing permissions and does not affect other dates. The city host and super-admin retain cancellation control. Use **Revoke delegation** before choosing a replacement for a pending or accepted invitation.

## Signing and approval are different

Your signature proves who requested a change. It does not automatically make a pending city public, activate a relay or establish a paid entitlement. The dashboard shows those steps separately.
