#!/usr/bin/env bash
set -euo pipefail

candidate="6bb8520025d781f8570ef1a5d134fe545a1586f3ab46cfedd780e15a641cfa84"
short="${candidate:0:12}"
container="bitcoinwalk-hub-feecap-candidate"

if [[ "$(id -u)" == "0" ]]; then echo "Non-root only" >&2; exit 1; fi
if [[ $# -ne 3 || "$2" != /* || "$2" == "/" || ! "$3" =~ ^[0-9a-f]{64}$ ]]; then
  echo "usage: $0 CONTAINER_BUNDLE ABSOLUTE_CANDIDATE_ROOT EXPECTED_SHA256" >&2
  exit 1
fi
bundle="$(readlink -f -- "$1")"
root="$2"
expected_sha256="$3"
[[ -f "$bundle" && ! -e "$root" ]] || { echo "Bundle missing or target already exists" >&2; exit 1; }
actual_sha256="$(sha256sum "$bundle" | cut -d' ' -f1)"
[[ "$actual_sha256" == "$expected_sha256" ]] || { echo "Container bundle checksum mismatch" >&2; exit 1; }

security="$(docker info --format '{{json .SecurityOptions}}')"
grep -q 'name=rootless' <<< "$security" || { echo "A rootless Docker daemon is required" >&2; exit 1; }
if docker container inspect "$container" >/dev/null 2>&1; then
  echo "Candidate container already exists" >&2
  exit 1
fi

mkdir -m 700 -- "$root"
trap 'if [[ -d "$root" && ! -e "$root/.staged" ]]; then rm -rf -- "$root"; fi' EXIT
listing="$(tar -tzf "$bundle")"
if grep -Eq '(^/|(^|/)\.\.(/|$))' <<< "$listing"; then echo "Unsafe bundle paths" >&2; exit 1; fi
types="$(LC_ALL=C tar -tvzf "$bundle")"
if grep -Eq '^[^d-]' <<< "$types"; then echo "Bundle links and special files are not allowed" >&2; exit 1; fi
tar -xzf "$bundle" -C "$root" --strip-components=1 --no-same-owner --no-same-permissions
(cd "$root" && sha256sum -c SHA256SUMS)
grep -q '"productionReady": false' "$root/container-manifest.json"
grep -q '"startEnabled": false' "$root/container-manifest.json"
mkdir -m 700 -- "$root/state"
printf '%s\n' "$candidate" > "$root/state/.bitcoinwalk-no-spend-candidate"
chmod 600 "$root/state/.bitcoinwalk-no-spend-candidate"

export BW_CANDIDATE_ROOT="$root"
export BW_CANDIDATE_START="disabled"
docker compose -f "$root/compose.candidate.yaml" --profile explicit-candidate build --pull hub-candidate
image_id="$(docker image inspect "bitcoinwalk/hub-feecap-candidate:$short" --format '{{.Id}}')"
set +e
docker run --rm --network none --read-only \
  --security-opt no-new-privileges --cap-drop ALL \
  -e BW_CANDIDATE_START=disabled \
  "bitcoinwalk/hub-feecap-candidate:$short"
disabled_status=$?
set -e
[[ "$disabled_status" -eq 78 ]] || { echo "Disabled-start gate returned $disabled_status" >&2; exit 1; }
docker compose -f "$root/compose.candidate.yaml" --profile explicit-candidate create --no-build hub-candidate
running="$(docker inspect "$container" --format '{{.State.Running}}')"
restart="$(docker inspect "$container" --format '{{.HostConfig.RestartPolicy.Name}}')"
readonly="$(docker inspect "$container" --format '{{.HostConfig.ReadonlyRootfs}}')"
bound_ip="$(docker inspect "$container" --format '{{(index (index .HostConfig.PortBindings "8080/tcp") 0).HostIp}}')"
[[ "$running" == "false" && "$restart" == "no" && "$readonly" == "true" && "$bound_ip" == "127.0.0.1" ]] || {
  echo "Created container does not match the stopped safety policy" >&2
  exit 1
}
printf '%s\n' "$image_id" > "$root/image.id"
chmod 600 "$root/image.id"
touch "$root/.staged"
printf '%s\n' "Staged stopped rootless container $container at image $image_id. It has never started."
