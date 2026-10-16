#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
for file in production-entrypoint.sh cutover-live-hub-feecap.sh rollback-live-hub-feecap.sh finalize-live-hub-feecap.sh; do
  bash -n "$root/$file"
done

cutover="$root/cutover-live-hub-feecap.sh"
for safeguard in \
  '--approved-cutover' \
  'Sponsor payout boundary is not safely disabled.' \
  'docker build --network none --pull=false' \
  'timeout 180 docker stop --time 120' \
  'rollback_on_exit' \
  'docker start "$live_container"' \
  'rollback_retained=yes' \
  'manual_unlock_required=yes' \
  'payouts_enabled=no'; do
  grep -Fq -- "$safeguard" "$cutover" || { echo "Missing cutover safeguard: $safeguard" >&2; exit 1; }
done
for forbidden in 'AUTO_UNLOCK_PASSWORD=' 'gpg --decrypt' 'pay_invoice' 'make_invoice' 'BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED=1' 'docker system prune'; do
  ! grep -Fq -- "$forbidden" \
    "$root/Dockerfile.production" \
    "$root/production-entrypoint.sh" \
    "$root/cutover-live-hub-feecap.sh" \
    "$root/rollback-live-hub-feecap.sh" \
    "$root/finalize-live-hub-feecap.sh" \
    || { echo "Forbidden cutover operation: $forbidden" >&2; exit 1; }
done
grep -Fq 'production-ready="true"' "$root/Dockerfile.production"
grep -Fq 'start-enabled="true"' "$root/Dockerfile.production"
grep -Fq 'Production fee-cap start is not approved.' "$root/production-entrypoint.sh"
grep -Fq -- '--approved-rollback' "$root/rollback-live-hub-feecap.sh"
grep -Fq -- '--approved-finalize' "$root/finalize-live-hub-feecap.sh"
printf '%s\n' "Live Hub fee-cap cutover package passed."
