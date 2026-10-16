#!/usr/bin/env bash
set -euo pipefail
umask 077

live_container="albyhub"
live_image="sha256:2982a75a63c4dace6e203ee4cd803f8481f236ebf5ec50c4e2d0f8711e79869a"
live_root="/var/lib/docker/volumes/albyhub-data/_data"
candidate_image="bitcoinwalk/hub-feecap-candidate:6bb8520025d7"
candidate_local_image="sha256:50dd5e8e272b0cff1aeefd3a88579347d8e3852bc845893974fd7f7a0c065afd"
candidate_revision="6bb8520025d781f8570ef1a5d134fe545a1586f3ab46cfedd780e15a641cfa84"
rehearsal_container="bitcoinwalk-hub-feecap-live-rehearsal"
rehearsal_volume="bitcoinwalk-hub-feecap-live-rehearsal-data"
rehearsal_network="bitcoinwalk-hub-feecap-live-rehearsal-net"
evidence_root="/var/backups/bitcoinwalk-hub-feecap-live-rehearsal"

[[ "$(id -u)" == "0" ]] || { echo "Root is required for the approved volume rehearsal." >&2; exit 77; }
[[ $# -eq 1 && "$1" == "--approved-copy-start-cleanup" ]] || {
  echo "usage: $0 --approved-copy-start-cleanup" >&2
  exit 64
}
for required in docker curl jq nsenter sqlite3 tar timeout; do
  command -v "$required" >/dev/null 2>&1 || { echo "$required is required." >&2; exit 69; }
done

[[ "$(docker inspect "$live_container" --format '{{.Image}}')" == "$live_image" ]] || {
  echo "Live Hub image identity changed." >&2
  exit 65
}
[[ "$(docker inspect "$live_container" --format '{{.State.Running}}')" == "true" ]] || {
  echo "Live Hub is not running." >&2
  exit 65
}
[[ "$(docker image inspect "$candidate_image" --format '{{.Id}}')" == "$candidate_local_image" ]] || {
  echo "Reviewed candidate image identity changed." >&2
  exit 65
}
[[ "$(docker image inspect "$candidate_image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" == "$candidate_revision" ]] || {
  echo "Reviewed candidate revision label changed." >&2
  exit 65
}
[[ "$(docker image inspect "$candidate_image" --format '{{index .Config.Labels "org.bitcoinwalk.production-ready"}}')" == "false" ]] || exit 65
[[ "$(docker image inspect "$candidate_image" --format '{{index .Config.Labels "org.bitcoinwalk.start-enabled"}}')" == "false" ]] || exit 65
[[ -d "$live_root/albyhub" && -f "$live_root/albyhub/nwc.db" && ! -L "$live_root" ]] || {
  echo "Live Hub volume boundary changed." >&2
  exit 65
}
for object in "$rehearsal_container"; do
  ! docker container inspect "$object" >/dev/null 2>&1 || { echo "Rehearsal container already exists." >&2; exit 73; }
done
! docker volume inspect "$rehearsal_volume" >/dev/null 2>&1 || { echo "Rehearsal volume already exists." >&2; exit 73; }
! docker network inspect "$rehearsal_network" >/dev/null 2>&1 || { echo "Rehearsal network already exists." >&2; exit 73; }

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
evidence="$evidence_root/$timestamp"
mkdir -p -m 700 -- "$evidence"
live_restarted=false
cleanup_complete=false

restart_live() {
  if [[ "$(docker inspect "$live_container" --format '{{.State.Running}}' 2>/dev/null || true)" != "true" ]]; then
    docker start "$live_container" >/dev/null || true
  fi
}
cleanup_rehearsal() {
  docker rm -f "$rehearsal_container" >/dev/null 2>&1 || true
  docker network rm "$rehearsal_network" >/dev/null 2>&1 || true
  docker volume rm "$rehearsal_volume" >/dev/null 2>&1 || true
}
on_exit() {
  status=$?
  trap - EXIT INT TERM
  restart_live
  if [[ "$cleanup_complete" != "true" ]]; then cleanup_rehearsal; fi
  exit "$status"
}
trap on_exit EXIT INT TERM

safe_app_inventory() {
  local db="$1"
  sqlite3 -readonly -batch -noheader "$db" '
    SELECT "apps=" || COUNT(*) ||
      ";isolated=" || COALESCE(SUM(CASE WHEN isolated THEN 1 ELSE 0 END), 0)
    FROM apps;
    SELECT "permissions=" || COUNT(*) ||
      ";positive_budgets=" || COALESCE(SUM(CASE WHEN max_amount_sat > 0 THEN 1 ELSE 0 END), 0) ||
      ";nonrenewing=" || COALESCE(SUM(CASE WHEN budget_renewal = "never" THEN 1 ELSE 0 END), 0)
    FROM app_permissions;
  '
}

live_info="$(curl -fsS --max-time 8 http://127.0.0.1:8080/api/info)"
jq -e '.version == "v1.24.0" and .setupCompleted == true' >/dev/null <<<"$live_info"
printf '%s\n' "$live_info" | jq '{version,setupCompleted,running,unlocked,network}' > "$evidence/live-before.json"

docker volume create "$rehearsal_volume" >/dev/null
rehearsal_root="$(docker volume inspect "$rehearsal_volume" --format '{{.Mountpoint}}')"
[[ -d "$rehearsal_root" && ! -L "$rehearsal_root" && -z "$(find "$rehearsal_root" -mindepth 1 -print -quit)" ]] || {
  echo "Rehearsal volume is not a new empty directory." >&2
  exit 73
}

outage_started="$(date +%s)"
timeout 180 docker stop --time 120 "$live_container" >/dev/null
[[ "$(docker inspect "$live_container" --format '{{.State.Running}}')" == "false" ]] || exit 70

[[ "$(sqlite3 -readonly "$live_root/albyhub/nwc.db" 'PRAGMA integrity_check;')" == "ok" ]] || {
  echo "Live Hub SQLite integrity check failed while fenced." >&2
  exit 67
}
safe_app_inventory "$live_root/albyhub/nwc.db" > "$evidence/apps-before.txt"
tar --numeric-owner --acls --xattrs --one-file-system -C "$live_root" -cpf - . \
  | tar --numeric-owner --acls --xattrs -C "$rehearsal_root" -xpf -
[[ "$(sqlite3 -readonly "$rehearsal_root/albyhub/nwc.db" 'PRAGMA integrity_check;')" == "ok" ]] || {
  echo "Copied Hub SQLite integrity check failed." >&2
  exit 67
}
safe_app_inventory "$rehearsal_root/albyhub/nwc.db" > "$evidence/apps-copied.txt"
cmp -s "$evidence/apps-before.txt" "$evidence/apps-copied.txt" || {
  echo "Safe app inventory changed during the fenced copy." >&2
  exit 67
}

docker start "$live_container" >/dev/null
for _ in $(seq 1 60); do
  if live_after="$(curl -fsS --max-time 3 http://127.0.0.1:8080/api/info 2>/dev/null)" \
    && jq -e '.version == "v1.24.0" and .setupCompleted == true' >/dev/null <<<"$live_after"; then
    live_restarted=true
    break
  fi
  sleep 1
done
[[ "$live_restarted" == "true" ]] || { echo "Live Hub did not return healthy after restart." >&2; exit 70; }
outage_seconds="$(( $(date +%s) - outage_started ))"
[[ "$outage_seconds" -le 300 ]] || { echo "Live Hub interruption exceeded five minutes." >&2; exit 70; }
printf '%s\n' "$live_after" | jq '{version,setupCompleted,running,unlocked,network}' > "$evidence/live-after.json"

printf '%s\n' "$candidate_revision" > "$rehearsal_root/.bitcoinwalk-no-spend-candidate"
chmod 600 "$rehearsal_root/.bitcoinwalk-no-spend-candidate"
docker network create --internal "$rehearsal_network" >/dev/null
docker create \
  --name "$rehearsal_container" \
  --restart no \
  --read-only \
  --init \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --pids-limit 128 \
  --memory 2g \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m \
  --network "$rehearsal_network" \
  -v "$rehearsal_volume:/data" \
  -e BW_CANDIDATE_START=reviewed-no-spend \
  -e WORK_DIR=/data/albyhub \
  -e PORT=8080 \
  -e LOG_TO_FILE=true \
  -e SEND_EVENTS_TO_ALBY=false \
  -e AUTO_LINK_ALBY_ACCOUNT=false \
  -e HIDE_UPDATE_BANNER=true \
  -e ENABLE_ADVANCED_SETUP=false \
  "$candidate_image" >/dev/null

[[ "$(docker inspect "$rehearsal_container" --format '{{.HostConfig.NetworkMode}}')" == "$rehearsal_network" ]] || exit 65
[[ "$(docker inspect "$rehearsal_container" --format '{{.HostConfig.ReadonlyRootfs}}')" == "true" ]] || exit 65
[[ "$(docker inspect "$rehearsal_container" --format '{{.HostConfig.RestartPolicy.Name}}')" == "no" ]] || exit 65
[[ "$(docker inspect "$rehearsal_container" --format '{{json .HostConfig.PortBindings}}')" == "{}" ]] || exit 65
[[ "$(docker network inspect "$rehearsal_network" --format '{{.Internal}}')" == "true" ]] || exit 65

docker start "$rehearsal_container" >/dev/null
candidate_healthy=false
for _ in $(seq 1 90); do
  candidate_pid="$(docker inspect "$rehearsal_container" --format '{{.State.Pid}}')"
  if [[ "$candidate_pid" =~ ^[1-9][0-9]*$ ]] \
    && candidate_info="$(nsenter --target "$candidate_pid" --net curl -fsS --max-time 3 http://127.0.0.1:8080/api/info 2>/dev/null)" \
    && jq -e '.version == "bitcoinwalk-feecap-6bb8520025d7" and .setupCompleted == true' >/dev/null <<<"$candidate_info"; then
    candidate_healthy=true
    break
  fi
  if [[ "$(docker inspect "$rehearsal_container" --format '{{.State.Running}}')" != "true" ]]; then break; fi
  sleep 1
done
docker logs --tail 120 "$rehearsal_container" > "$evidence/candidate.log" 2>&1 || true
[[ "$candidate_healthy" == "true" ]] || {
  echo "Reviewed candidate did not accept the copied state; evidence retained for review." >&2
  exit 70
}
printf '%s\n' "$candidate_info" | jq '{version,setupCompleted,running,unlocked,network}' > "$evidence/candidate-info.json"
docker stop --time 120 "$rehearsal_container" >/dev/null

[[ "$(sqlite3 -readonly "$rehearsal_root/albyhub/nwc.db" 'PRAGMA integrity_check;')" == "ok" ]] || {
  echo "Migrated rehearsal SQLite integrity check failed." >&2
  exit 67
}
safe_app_inventory "$rehearsal_root/albyhub/nwc.db" > "$evidence/apps-after.txt"
cmp -s "$evidence/apps-before.txt" "$evidence/apps-after.txt" || {
  echo "Safe app inventory changed during candidate start." >&2
  exit 67
}

printf 'live_image=%s\ncandidate_image=%s\ncandidate_revision=%s\nweb_restart_seconds=%s\nmanual_unlock_required=true\n' \
  "$live_image" "$candidate_local_image" "$candidate_revision" "$outage_seconds" > "$evidence/manifest.txt"
chmod -R go-rwx "$evidence"

docker rm "$rehearsal_container" >/dev/null
docker network rm "$rehearsal_network" >/dev/null
docker volume rm "$rehearsal_volume" >/dev/null
cleanup_complete=true
trap - EXIT INT TERM

[[ "$(docker inspect "$live_container" --format '{{.State.Running}}')" == "true" ]] || exit 70
[[ ! -e "$rehearsal_root" ]] || { echo "Temporary rehearsal volume still exists." >&2; exit 73; }
printf 'LIVE_HUB_MIGRATION_REHEARSAL_OK web_restart_seconds=%s evidence=%s temporary_wallet_copy_removed=yes manual_unlock_required=yes\n' "$outage_seconds" "$evidence"
