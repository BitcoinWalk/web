#!/usr/bin/env bash
set -euo pipefail
umask 077

revision="6bb8520025d781f8570ef1a5d134fe545a1586f3ab46cfedd780e15a641cfa84"
revision_short="6bb8520025d7"
old_image="sha256:2982a75a63c4dace6e203ee4cd803f8481f236ebf5ec50c4e2d0f8711e79869a"
candidate_image="bitcoinwalk/hub-feecap-candidate:$revision_short"
candidate_id="sha256:50dd5e8e272b0cff1aeefd3a88579347d8e3852bc845893974fd7f7a0c065afd"
production_image="bitcoinwalk/hub-feecap-production:$revision_short"
live_container="albyhub"
next_container="albyhub-feecap-next"
legacy_container="albyhub-before-feecap-$revision_short"
live_volume="albyhub-data"
snapshot_volume="albyhub-pre-feecap-$revision_short"
network="root_my_custom_network"
live_root="/var/lib/docker/volumes/$live_volume/_data"
evidence_root="/var/backups/bitcoinwalk-hub-feecap-cutover"
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

[[ "$(id -u)" == "0" ]] || { echo "Root is required for the approved cutover." >&2; exit 77; }
[[ $# -eq 1 && "$1" == "--approved-cutover" ]] || {
  echo "usage: $0 --approved-cutover" >&2
  exit 64
}
for required in docker curl jq sqlite3 tar timeout sha256sum runuser; do
  command -v "$required" >/dev/null 2>&1 || { echo "$required is required." >&2; exit 69; }
done
sha256sum -c "$here/SHA256SUMS" >/dev/null

[[ "$(docker inspect "$live_container" --format '{{.Image}}')" == "$old_image" ]] || { echo "Live Hub image changed." >&2; exit 65; }
[[ "$(docker inspect "$live_container" --format '{{.State.Running}}')" == "true" ]] || { echo "Live Hub is not running." >&2; exit 65; }
[[ "$(docker inspect "$live_container" --format '{{.HostConfig.NetworkMode}}')" == "$network" ]] || exit 65
[[ "$(docker image inspect "$candidate_image" --format '{{.Id}}')" == "$candidate_id" ]] || { echo "Reviewed candidate image changed." >&2; exit 65; }
[[ "$(docker image inspect "$candidate_image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" == "$revision" ]] || exit 65
[[ -d "$live_root/albyhub" && -f "$live_root/albyhub/nwc.db" && ! -L "$live_root" ]] || { echo "Live volume changed." >&2; exit 65; }
! docker container inspect "$next_container" >/dev/null 2>&1 || { echo "Next container already exists." >&2; exit 73; }
! docker container inspect "$legacy_container" >/dev/null 2>&1 || { echo "Retained predecessor already exists." >&2; exit 73; }
! docker volume inspect "$snapshot_volume" >/dev/null 2>&1 || { echo "Rollback snapshot already exists." >&2; exit 73; }

info="$(curl -fsS --max-time 8 http://127.0.0.1:8080/api/info)"
jq -e '.version == "v1.24.0" and .setupCompleted == true and .running == true and .network == "bitcoin"' >/dev/null <<<"$info"
uid="$(id -u bitcoinwalk)"
sponsor_boundary="$(runuser -u bitcoinwalk -- env XDG_RUNTIME_DIR="/run/user/$uid" docker inspect bitcoinwalk-sponsor-payout --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}')"
[[ "$sponsor_boundary" == "0.1.1|disabled|none|running" ]] || { echo "Sponsor payout boundary is not safely disabled." >&2; exit 65; }

docker build --network none --pull=false -f "$here/Dockerfile.production" -t "$production_image" "$here" >/dev/null
[[ "$(docker image inspect "$production_image" --format '{{index .Config.Labels "org.bitcoinwalk.production-ready"}}|{{index .Config.Labels "org.bitcoinwalk.start-enabled"}}|{{index .Config.Labels "org.opencontainers.image.revision"}}')" == "true|true|$revision" ]] || exit 65
candidate_layers="$(docker image inspect "$candidate_image" --format '{{json .RootFS.Layers}}')"
production_layers="$(docker image inspect "$production_image" --format '{{json .RootFS.Layers}}')"
python3 - "$candidate_layers" "$production_layers" <<'PY'
import json,sys
candidate=json.loads(sys.argv[1]); production=json.loads(sys.argv[2])
if production[:len(candidate)] != candidate or len(production) != len(candidate)+1:
    raise SystemExit("Production image is not the exact reviewed candidate plus one entrypoint layer.")
PY

safe_inventory() {
  sqlite3 -readonly -batch -noheader "$1" '
    SELECT "apps=" || COUNT(*) || ";isolated=" || COALESCE(SUM(CASE WHEN isolated THEN 1 ELSE 0 END), 0) FROM apps;
    SELECT "permissions=" || COUNT(*) || ";positive_budgets=" || COALESCE(SUM(CASE WHEN max_amount_sat > 0 THEN 1 ELSE 0 END), 0) || ";nonrenewing=" || COALESCE(SUM(CASE WHEN budget_renewal = "never" THEN 1 ELSE 0 END), 0) FROM app_permissions;
  '
}

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
evidence="$evidence_root/$timestamp"
mkdir -p -m 700 -- "$evidence"
printf '%s\n' "$info" | jq '{version,setupCompleted,running,unlocked,network}' > "$evidence/live-before.json"
printf 'old_image=%s\ncandidate_id=%s\nrevision=%s\nsponsor_boundary=%s\n' "$old_image" "$candidate_id" "$revision" "$sponsor_boundary" > "$evidence/manifest.txt"

predecessor_stopped=false
cutover_complete=false
rollback_on_exit() {
  status=$?
  trap - EXIT INT TERM
  if [[ "$predecessor_stopped" == "true" && "$cutover_complete" != "true" ]]; then
    if docker container inspect "$legacy_container" >/dev/null 2>&1; then
      "$here/rollback-live-hub-feecap.sh" --approved-rollback || true
    elif docker container inspect "$live_container" >/dev/null 2>&1; then
      docker start "$live_container" >/dev/null 2>&1 || true
    fi
  fi
  exit "$status"
}
trap rollback_on_exit EXIT INT TERM

docker volume create "$snapshot_volume" >/dev/null
snapshot_root="$(docker volume inspect "$snapshot_volume" --format '{{.Mountpoint}}')"
[[ "$snapshot_root" == "/var/lib/docker/volumes/$snapshot_volume/_data" && -d "$snapshot_root" && ! -L "$snapshot_root" && -z "$(find "$snapshot_root" -mindepth 1 -print -quit)" ]] || exit 73

outage_started="$(date +%s)"
timeout 180 docker stop --time 120 "$live_container" >/dev/null
predecessor_stopped=true
[[ "$(sqlite3 -readonly "$live_root/albyhub/nwc.db" 'PRAGMA integrity_check;')" == "ok" ]] || exit 67
safe_inventory "$live_root/albyhub/nwc.db" > "$evidence/apps-before.txt"
tar --numeric-owner --acls --xattrs --one-file-system -C "$live_root" -cpf - . \
  | tar --numeric-owner --acls --xattrs -C "$snapshot_root" -xpf -
[[ "$(sqlite3 -readonly "$snapshot_root/albyhub/nwc.db" 'PRAGMA integrity_check;')" == "ok" ]] || exit 67
safe_inventory "$snapshot_root/albyhub/nwc.db" > "$evidence/apps-snapshot.txt"
cmp -s "$evidence/apps-before.txt" "$evidence/apps-snapshot.txt" || exit 67

docker rename "$live_container" "$legacy_container"
docker network disconnect "$network" "$legacy_container"
printf '%s\n' "$revision" > "$live_root/.bitcoinwalk-feecap-production"
chmod 600 "$live_root/.bitcoinwalk-feecap-production"

docker create \
  --name "$next_container" \
  --restart unless-stopped \
  --read-only \
  --init \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --pids-limit 256 \
  --memory 2g \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m \
  --network "$network" \
  --network-alias albyhub \
  -p 127.0.0.1:8080:8080 \
  -p 9735:9735 \
  -v "$live_volume:/data" \
  -e BW_FEE_CAP_CUTOVER=approved-production \
  -e WORK_DIR=/data/albyhub \
  -e PORT=8080 \
  -e LOG_TO_FILE=true \
  -e SEND_EVENTS_TO_ALBY=false \
  -e AUTO_LINK_ALBY_ACCOUNT=false \
  -e HIDE_UPDATE_BANNER=true \
  -e ENABLE_ADVANCED_SETUP=false \
  "$production_image" >/dev/null
docker rename "$next_container" "$live_container"
docker start "$live_container" >/dev/null

healthy=false
for _ in $(seq 1 120); do
  if after="$(curl -fsS --max-time 3 http://127.0.0.1:8080/api/info 2>/dev/null)" \
    && jq -e '.version == "bitcoinwalk-feecap-6bb8520025d7" and .setupCompleted == true' >/dev/null <<<"$after"; then
    healthy=true
    break
  fi
  if [[ "$(docker inspect "$live_container" --format '{{.State.Running}}')" != "true" ]]; then break; fi
  sleep 1
done
[[ "$healthy" == "true" ]] || { echo "The reviewed fee-cap Hub web service did not return; rolling back." >&2; exit 70; }
printf '%s\n' "$after" | jq '{version,setupCompleted,running,unlocked,network}' > "$evidence/live-after.json"
[[ "$(sqlite3 -readonly "$live_root/albyhub/nwc.db" 'PRAGMA integrity_check;')" == "ok" ]] || exit 67
safe_inventory "$live_root/albyhub/nwc.db" > "$evidence/apps-after.txt"
cmp -s "$evidence/apps-before.txt" "$evidence/apps-after.txt" || exit 67
outage_seconds="$(( $(date +%s) - outage_started ))"
printf 'outage_seconds=%s\nrollback_container=%s\nrollback_volume=%s\nmanual_unlock_required=true\n' "$outage_seconds" "$legacy_container" "$snapshot_volume" >> "$evidence/manifest.txt"
chmod -R go-rwx "$evidence"
cutover_complete=true
trap - EXIT INT TERM
printf 'LIVE_HUB_FEECAP_CUTOVER_OK outage_seconds=%s evidence=%s rollback_retained=yes manual_unlock_required=yes payouts_enabled=no\n' "$outage_seconds" "$evidence"
