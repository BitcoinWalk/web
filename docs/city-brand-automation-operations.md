# City identity automation operations

This BW-78 package is disabled by default. It contains a worker and this runbook,
not a key, signed policy, service unit, timer or installer. Installing the archive
cannot approve or publish a city.

## Credentials and configuration

The write path requires two separate owner-only systemd credentials:

- `policy.json`: the exact super-admin-signed environment and capacity policy;
- `signer-key`: the dedicated automation secret named by that policy.

Never use the super-admin, Guide, wallet, relay service or city key. The worker
needs only the existing app evidence database, loopback/public relay addresses,
deployment profile, public automation key, environment and explicit enable flag.
Do not give it `BITCOINWALK_NWC_URL` or any other payment credential.

Dry-run mode reads only `policy.json`; it never opens `signer-key`. It lists
retained requests that could enter review but makes no decision or database
change. Write mode additionally requires
`BITCOINWALK_CITY_BRAND_AUTOMATION_ENABLED=1`, loads `signer-key`, repeats fresh
authority/setup checks, signs at most the policy capacity and records exact relay
read-back.

## Staging order

1. Review the package manifest and confirm the bundle contains no NWC/payment
   runtime.
2. Generate a new dedicated key offline and retain only its public key for app
   and relay configuration.
3. Sign one staging policy offline with a small city limit. Keep the super-admin
   key outside the VPS and app.
4. Deploy the relay and app public-key configuration with automation disabled.
5. Run the policy-only dry run against a database backup, then the live staging
   database. Expected output is bounded JSON with candidate request and city IDs.
6. Add the dedicated signer credential only after reviewing that output. Enable
   one explicit write run, verify the exact event independently on every relay,
   then disable the worker again.

Removing the app enable flag or relay automation public key revokes new automated
decisions. Existing signed history remains auditable and may be revoked only by
the ordinary super-admin workflow. A blocked row stays in `/admin/requests` with
its reason and manual action.
