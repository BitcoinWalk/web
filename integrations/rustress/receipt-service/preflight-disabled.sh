#!/bin/sh
# Read-only baseline check. Passing is NOT permission to activate native zaps.
set -eu
fail(){ printf 'Receipt baseline check failed: %s\n' "$1" >&2; exit 1; }
[ "$(id -u)" -ne 0 ] && [ "$(id -un)" = bitcoinwalk ] || fail non-root-service-owner-required
docker info --format '{{json .SecurityOptions}}' | grep -q '"name=rootless"' || fail rootless-docker-required
here=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
(cd "$here" && sha256sum -c SHA256SUMS >/dev/null) || fail candidate-checksums
root=/home/bitcoinwalk/.local/state/bitcoinwalk-rustress/receipt-service
service=bitcoinwalk-rustress-receipt
[ "$(docker inspect --format '{{.State.Running}}|{{.HostConfig.NetworkMode}}|{{.HostConfig.ReadonlyRootfs}}|{{.HostConfig.Privileged}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}' "$service-worker")" = 'true|none|true|false|disabled' ] || fail worker-not-disabled-and-isolated
for role in signer relay-egress; do
 if docker container inspect "$service-$role" >/dev/null 2>&1; then fail unexpected-active-component; fi
done
docker exec "$service-worker" node /app/verify-rustress-receipt-worker.cjs disabled >/dev/null || fail worker-health
for path in "$root/config/provider-pubkey" "$root/secrets/provider-secret-key"; do
 [ -f "$path" ] && [ ! -L "$path" ] && [ "$(realpath "$path")" = "$path" ] && [ "$(stat -c '%U:%a:%h' "$path")" = 'bitcoinwalk:600:1' ] || fail provider-file-metadata
done
# Only the PUBLIC key is read. Never inspect or display the provider secret.
[ "$(tr -d '\n' < "$root/config/provider-pubkey")" = 2443b1e4131ffc719cc80257b207ff1b29735356715b288715a438c22aabfe5a ] || fail provider-identity-drift
now=$(date +%s)
for component in worker signer; do
 path="/home/bitcoinwalk/.local/state/bitcoinwalk-receipt-backup-$component/last-success"
 [ -f "$path" ] && [ ! -L "$path" ] && [ "$(stat -c '%U:%a' "$path")" = 'bitcoinwalk:600' ] || fail backup-receipt-missing
 age=$((now-$(stat -c %Y "$path")))
 [ "$age" -ge 0 ] && [ "$age" -le 172800 ] || fail backup-receipt-stale
done
printf '%s\n' 'RECEIPT_DISABLED_BASELINE_OK' 'This checks local backup receipts, not remote restore integrity.' 'NOT ACTIVATION APPROVAL: supplemental review, bounded activation/rollback, provider/evidence rollout and live acceptance remain required.'
