#!/usr/bin/env bash
set -euo pipefail
umask 077

revision_short="6bb8520025d7"
legacy_container="albyhub-before-feecap-$revision_short"
snapshot_volume="albyhub-pre-feecap-$revision_short"
network="root_my_custom_network"
live_volume="albyhub-data"
live_root="/var/lib/docker/volumes/$live_volume/_data"
old_image="sha256:2982a75a63c4dace6e203ee4cd803f8481f236ebf5ec50c4e2d0f8711e79869a"

[[ "$(id -u)" == "0" ]] || { echo "Root is required." >&2; exit 77; }
[[ $# -eq 1 && "$1" == "--approved-rollback" ]] || {
  echo "usage: $0 --approved-rollback" >&2
  exit 64
}
for required in docker sqlite3 tar timeout curl jq; do
  command -v "$required" >/dev/null 2>&1 || { echo "$required is required." >&2; exit 69; }
done
[[ "$live_root" == "/var/lib/docker/volumes/albyhub-data/_data" && -d "$live_root" && ! -L "$live_root" ]] || exit 65
snapshot_root="$(docker volume inspect "$snapshot_volume" --format '{{.Mountpoint}}')"
[[ "$snapshot_root" == "/var/lib/docker/volumes/$snapshot_volume/_data" && -d "$snapshot_root" && ! -L "$snapshot_root" ]] || exit 65
[[ "$(docker inspect "$legacy_container" --format '{{.Image}}')" == "$old_image" ]] || {
  echo "The retained predecessor is not the reviewed live image." >&2
  exit 65
}

if docker container inspect albyhub >/dev/null 2>&1; then
  timeout 180 docker stop --time 120 albyhub >/dev/null 2>&1 || true
  docker rm albyhub >/dev/null
fi
find "$live_root" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
tar --numeric-owner --acls --xattrs --one-file-system -C "$snapshot_root" -cpf - . \
  | tar --numeric-owner --acls --xattrs -C "$live_root" -xpf -
[[ "$(sqlite3 -readonly "$live_root/albyhub/nwc.db" 'PRAGMA integrity_check;')" == "ok" ]] || exit 67

docker rename "$legacy_container" albyhub
if [[ "$(docker inspect albyhub --format '{{json .NetworkSettings.Networks}}')" == "{}" ]]; then
  docker network connect --alias albyhub "$network" albyhub
fi
docker start albyhub >/dev/null
healthy=false
for _ in $(seq 1 90); do
  if info="$(curl -fsS --max-time 3 http://127.0.0.1:8080/api/info 2>/dev/null)" \
    && jq -e '.version == "v1.24.0" and .setupCompleted == true' >/dev/null <<<"$info"; then
    healthy=true
    break
  fi
  sleep 1
done
[[ "$healthy" == "true" ]] || { echo "The predecessor web service did not return." >&2; exit 70; }
printf '%s\n' "LIVE_HUB_FEECAP_ROLLBACK_OK manual_unlock_required=yes"
