#!/usr/bin/env bash
set -euo pipefail
umask 077

revision="6bb8520025d781f8570ef1a5d134fe545a1586f3ab46cfedd780e15a641cfa84"
revision_short="6bb8520025d7"
live_container="albyhub"
legacy_container="albyhub-before-feecap-$revision_short"
snapshot_volume="albyhub-pre-feecap-$revision_short"
production_image="bitcoinwalk/hub-feecap-production:$revision_short"
live_root="/var/lib/docker/volumes/albyhub-data/_data"

[[ "$(id -u)" == "0" ]] || { echo "Root is required." >&2; exit 77; }
[[ $# -eq 1 && "$1" == "--approved-finalize" ]] || { echo "usage: $0 --approved-finalize" >&2; exit 64; }
for required in docker curl jq sqlite3 runuser; do command -v "$required" >/dev/null 2>&1 || exit 69; done
[[ "$(docker inspect "$live_container" --format '{{.Image}}')" == "$(docker image inspect "$production_image" --format '{{.Id}}')" ]] || exit 65
[[ "$(docker image inspect "$production_image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" == "$revision" ]] || exit 65
[[ "$(docker inspect "$live_container" --format '{{.State.Running}}')" == "true" ]] || exit 65
[[ "$(cat "$live_root/.bitcoinwalk-feecap-production")" == "$revision" ]] || exit 65
info="$(curl -fsS --max-time 8 http://127.0.0.1:8080/api/info)"
jq -e '.version == "bitcoinwalk-feecap-6bb8520025d7" and .setupCompleted == true and .running == true and .network == "bitcoin"' >/dev/null <<<"$info"
[[ "$(sqlite3 -readonly "$live_root/albyhub/nwc.db" 'PRAGMA integrity_check;')" == "ok" ]] || exit 67
uid="$(id -u bitcoinwalk)"
boundary="$(runuser -u bitcoinwalk -- env XDG_RUNTIME_DIR="/run/user/$uid" docker inspect bitcoinwalk-sponsor-payout --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}')"
[[ "$boundary" == "0.1.1|disabled|none|running" ]] || exit 65
docker rm "$legacy_container" >/dev/null
docker volume rm "$snapshot_volume" >/dev/null
printf '%s\n' "LIVE_HUB_FEECAP_FINALIZED_OK rollback_snapshot_removed=yes sponsor_payout_disabled=yes"
