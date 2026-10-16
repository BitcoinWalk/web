#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
script="$root/rehearse-live-hub-migration.sh"
bash -n "$script"

for required in \
  'trap on_exit EXIT INT TERM' \
  'timeout 180 docker stop --time 120' \
  'docker start "$live_container"' \
  'docker network create --internal' \
  'nsenter --target "$candidate_pid" --net curl' \
  'AUTO_LINK_ALBY_ACCOUNT=false' \
  'SEND_EVENTS_TO_ALBY=false' \
  'manual_unlock_required=true' \
  'temporary_wallet_copy_removed=yes'; do
  grep -Fq "$required" "$script" || { echo "Missing rehearsal safeguard: $required" >&2; exit 1; }
done

for forbidden in \
  'AUTO_UNLOCK_PASSWORD=' 'docker exec' ' -p 127.0.0.1:' 'gpg --decrypt' 'cat "$live_root' \
  'sqlite3 "$live_root' 'curl -X POST' 'pay_invoice' 'make_invoice'; do
  if grep -Fq "$forbidden" "$script"; then
    echo "Forbidden rehearsal operation present: $forbidden" >&2
    exit 1
  fi
done

printf '%s\n' "Live Hub migration rehearsal package passed."
