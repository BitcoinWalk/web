#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
bash -n "$root/inspect-live-hub-boundary.sh"

grep -Fq 'docker inspect' "$root/inspect-live-hub-boundary.sh"
grep -Fq 'http://127.0.0.1:8080/api/info' "$root/inspect-live-hub-boundary.sh"
grep -Fq 'LIVE_HUB_BOUNDARY_READ_ONLY_OK' "$root/inspect-live-hub-boundary.sh"

for forbidden in \
  'docker stop' 'docker start' 'docker restart' 'docker rm' 'docker cp' \
  'docker exec' 'sqlite3' 'gpg --decrypt' 'cat /' 'printenv' '.Config.Cmd' \
  '.Config.Entrypoint'; do
  if grep -Fq "$forbidden" "$root/inspect-live-hub-boundary.sh"; then
    echo "Read-only boundary audit contains forbidden operation: $forbidden" >&2
    exit 1
  fi
done

printf '%s\n' "Live Hub boundary audit package passed."

