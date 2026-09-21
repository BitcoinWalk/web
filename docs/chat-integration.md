# City chat integration

Public city pages and authenticated previews share one `CityChat` component. Its single ordinary HTTPS link goes directly to official Armada. No iframe, self-hosted Armada, custom URI scheme, login automation or private-key input is used. App opening depends on the user's installed app and operating-system link settings.

## Routing and trust

`src/lib/chat-config.ts` is public, operator-controlled configuration. Currently it explicitly selects the verified **staging** global group `b7082b86a614153e` on `chat-staging.bitcoinwalk.org`; the UI labels it as staging. This is not a production chat launch. The legacy production relay is untouched.

- Free cities, old approved city records and the Austin demo use global chat.
- Paid cities are registered by immutable city UUID, with their expected slug and provisioned destination. A pending paid entry has `destination: null` and shows a setup message, not a broken or invented invite.
- A paid destination must match `wss://<slug>.bitcoinwalk.org` and have a verified group ID. The resolver only generates links on `https://armada.buzz`.
- Organizer-supplied legacy `chatUrl` values do not control the rendered button or paid status. No existing signed records are rewritten.
- New walk submissions automatically include the configured global link; the manual URL field is removed. Missing chat provisioning does not prevent submission. The legacy field is now optional, and calendar payloads omit it when absent.

After provisioning and testing a real paid relay/group, add an entry under `paidCities`:

```ts
"<verified-city-uuid>": {
  slug: "<approved-slug>",
  destination: { relay: "wss://<approved-slug>.bitcoinwalk.org", groupId: "<verified-group-id>" },
}
```

Do not use placeholder values in live configuration. No paid cities have been provisioned by this change. This static mapping is the initial operator-managed integration boundary, not payment verification or automatic provisioning. A future trusted provisioning registry should replace it.

## Verification / launch gates

- Automated tests cover free, dedicated, pending and missing destinations, city isolation, invalid URLs and group IDs.
- Verified 18 September 2026: all 28 tests pass, TypeScript/production build pass, lint has only two existing image warnings. Browser inspection of `/austin` confirms exactly one chat link to the configured official Armada channel, plus the staging notice. Authenticated Radom preview uses the shared component but requires the human's signer for live acceptance; no signing performed by this change.
- Check `/austin` for the single staging link; `/preview/radom` uses the same component after human signer authentication.
- Existing chat relay privacy and membership rules remain unchanged: open joining, members-only messages. The web button does not grant membership.
- Before production: provision/migrate and test the production global group, configure its actual relay/group, switch `environment` to `production`, then rebuild. Re-test web/mobile login, join, cross-user delivery and non-member read rejection. Paid provisioning and production migration remain separate tasks.
