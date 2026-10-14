---
title: Sponsor a BitcoinWalk
description: How sponsorship packages, approved artwork and the Pro-city 79/21 payment model work.
---

Sponsorship helps a local BitcoinWalk continue while giving a sponsor a clear, time-limited presence on the walks it supports. It does not give the sponsor control over the event, its participants or its content.

[Open the sponsorship page](https://bitcoinwalk.org/sponsor) to choose a city and available future walks. A city-specific invitation can open the same page with the city already selected.

## Choose the walks to support

BitcoinWalk currently offers three fixed packages:

| Package | Price |
| --- | ---: |
| 1 walk | 21,000 sats |
| 2 walks | 42,000 sats |
| 5 walks | 69,000 sats |

Only available future walks can be selected. If a city does not yet have enough published dates for the chosen package, the checkout will not create an invoice for that package.

## What happens after payment

1. Pay the Lightning invoice and wait for BitcoinWalk to verify the settlement.
2. Save the private checkout recovery file. Keep it safe: anyone who has it can reopen that checkout.
3. Connect or create the Nostr identity that will represent the sponsor, then sign the association.
4. Upload the sponsor logo and build a private preview of the sponsored image.
5. BitcoinWalk reviews the exact artwork and signs its public assignment to the purchased walks.

Payment and logo upload do not publish the sponsorship by themselves. This review step prevents an unverified payment, identity or image from appearing publicly.

## Sponsor artwork

For the best result, provide a horizontal logo with a transparent background:

- **Ideal size:** 1024 × 256 pixels, a 4:1 aspect ratio.
- **Minimum raster size:** 640 × 160 pixels.
- **Accepted files:** transparent PNG or WebP up to 5 MB, or a safe outlined SVG up to 512 KB.
- Use sRGB colour, crop closely around the mark and leave about 5% clear space.
- Convert SVG text to paths. Do not embed fonts, scripts, animations or external resources.
- Check that the complete logo remains readable at 400 × 100 pixels.

The final 1200 × 630 sharing image combines the city photograph, BitcoinWalk symbol, **Powered by** and the approved sponsor logo. The sponsor can build and download this preview before approval.

Approved sponsorship appears only on the walks covered by the package. After a covered walk, its current sharing image automatically returns to the standard city artwork. Previously generated images may remain in external social-media caches and BitcoinWalk retains approved artwork and historical generated images for audit and authorized reuse.

## Who benefits

- **The local host and community** gain support for keeping regular, welcoming walks active. Pro hosts can also receive their share of payments sent to the city's verified BitcoinWalk Lightning address.
- **The sponsor** supports a specific local community and receives approved visibility on the selected walk pages and their current sharing images.
- **BitcoinWalk HQ** maintains the shared website, public event feeds, media generation, directory, relay integrations, moderation and documentation used by every city.
- **Participants** keep access to community-led walks without sponsors receiving attendee data or editorial control.

## The Pro-city 79/21 split

An active Pro city has a verified BitcoinWalk Lightning address. Payments and zaps made to that city address are allocated as follows:

- **79% goes to the local Pro host's confirmed payout destination.**
- **21% is retained by BitcoinWalk HQ** to support the shared platform and operations.

The split is calculated before Lightning routing fees. The local host receives the full 79% allocation; BitcoinWalk pays supported outgoing routing fees from its share.

The fixed sponsorship checkout described above is currently a separate booking payment. It verifies the selected walks, payment, sponsor identity and artwork, but it must not be presented as an automatic 79/21 payout. The 79/21 allocation applies when a payment or zap uses the active Pro city's verified BitcoinWalk Lightning address.

The one-time 21,000-sat city upgrade to Pro is also separate from the 79/21 flow.
