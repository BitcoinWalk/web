#!/usr/bin/env bash
set -euo pipefail

container="bitcoinwalk-hub-feecap-candidate"

if [[ "$(id -u)" == "0" ]]; then echo "Non-root only" >&2; exit 1; fi
if [[ $# -ne 1 || "$1" != /* || "$1" == "/" ]]; then
  echo "usage: $0 ABSOLUTE_CANDIDATE_ROOT" >&2
  exit 1
fi
root="$1"
[[ ! -L "$root" && -O "$root" && -f "$root/image.id" ]] || { echo "Invalid candidate root" >&2; exit 1; }
security="$(docker info --format '{{json .SecurityOptions}}')"
grep -q 'name=rootless' <<< "$security" || { echo "A rootless Docker daemon is required" >&2; exit 1; }
expected_image="$(cat "$root/image.id")"
actual_image="$(docker inspect "$container" --format '{{.Image}}')"
[[ "$actual_image" == "$expected_image" ]] || { echo "Candidate image identity changed" >&2; exit 1; }

if [[ "$(docker inspect "$container" --format '{{.State.Running}}')" == "true" ]]; then
  docker stop --time 300 "$container" >/dev/null
fi
docker rm "$container" >/dev/null
printf '%s\n' "Removed only $container. Candidate image and state were preserved for review."
