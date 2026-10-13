#!/usr/bin/env bash
set -euo pipefail

compose=/root/docker-compose.yml
backup="$(mktemp -d /var/backups/bitcoinwalk-shared-host-ingress.XXXXXX)"
chmod 0700 "$backup"
cp -a "$compose" "$backup/docker-compose.yml"
ss -lntup >"$backup/listeners.before.txt"
docker ps --format '{{.Names}}|{{.Image}}|{{.Ports}}' >"$backup/containers.before.txt"

rollback(){
  cp -a "$backup/docker-compose.yml" "$compose"
  docker compose -f "$compose" up -d --no-deps nginx bitcoinwalk-manager rustress >/dev/null || true
  echo "Shared-host ingress restriction failed; original compose bindings were restored. Backup: $backup" >&2
}
trap rollback ERR

for binding in "'81:81'" '"7532:7532"' '"8889:8080"'; do
  test "$(grep -Fc -- "- $binding" "$compose")" -eq 1
done

sed \
  -e "s/- '81:81'/- '127.0.0.1:81:81'/" \
  -e 's/- "7532:7532"/- "127.0.0.1:7532:7532"/' \
  -e 's/- "8889:8080"/- "127.0.0.1:8889:8080"/' \
  "$compose" >"$backup/docker-compose.candidate.yml"

for binding in "'127.0.0.1:81:81'" '"127.0.0.1:7532:7532"' '"127.0.0.1:8889:8080"'; do
  test "$(grep -Fc -- "- $binding" "$backup/docker-compose.candidate.yml")" -eq 1
done
docker compose -f "$backup/docker-compose.candidate.yml" config -q
install -o root -g root -m 0600 "$backup/docker-compose.candidate.yml" "$compose"
docker compose -f "$compose" up -d --no-deps nginx bitcoinwalk-manager rustress

wait_http(){
  local port="$1"
  for _ in $(seq 1 20); do
    if curl -sS -o /dev/null --max-time 3 "http://127.0.0.1:$port/"; then return 0; fi
    sleep 1
  done
  return 1
}
for port in 81 7532 8889; do
  ss -ltn "sport = :$port" | grep -q '127.0.0.1:'
  ! ss -ltn "sport = :$port" | grep -Eq '0\.0\.0\.0:|\[::\]:'
  wait_http "$port"
done
for container in nginx bitcoinwalk-manager rustress; do
  test "$(docker inspect -f '{{.State.Running}}' "$container")" = true
done
for port in 80 443 6167 9735; do
  ss -ltn "sport = :$port" | grep -Eq '0\.0\.0\.0:|\[::\]:'
done

ss -lntup >"$backup/listeners.after.txt"
docker ps --format '{{.Names}}|{{.Image}}|{{.Ports}}' >"$backup/containers.after.txt"
trap - ERR

echo "Shared-host management bindings restricted on 0.8.93. Backup: $backup"
echo "Ports 81, 7532 and 8889 are loopback-only; public web, Matrix and Lightning listeners remain unchanged."
