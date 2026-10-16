#!/usr/bin/env bash
set -euo pipefail

# Inspect only metadata needed to plan a rollback-safe migration. Never print
# environment variables, labels, command arguments, database contents,
# credentials, recovery material, or balances.

if [[ "$(id -u)" != "0" ]]; then
  echo "Run this read-only inventory as root." >&2
  exit 77
fi

command -v docker >/dev/null 2>&1 || { echo "Docker is required." >&2; exit 69; }
command -v jq >/dev/null 2>&1 || { echo "jq is required." >&2; exit 69; }
command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; exit 69; }

info="$(curl -fsS --max-time 8 http://127.0.0.1:8080/api/info)"
version="$(jq -er '.version | select(type == "string" and length > 0)' <<<"$info")"
setup="$(jq -er '.setupCompleted | select(type == "boolean")' <<<"$info")"
running="$(jq -er '.running | select(type == "boolean")' <<<"$info")"
network="$(jq -er '.network | select(type == "string" and length > 0)' <<<"$info")"
[[ "$setup" == "true" && "$running" == "true" && "$network" == "bitcoin" ]] || {
  echo "The listener on 127.0.0.1:8080 is not the expected active mainnet Hub." >&2
  exit 65
}

mapfile -t container_ids < <(
  docker ps --no-trunc --format '{{.ID}}' | while IFS= read -r id; do
    docker inspect "$id" | jq -er '
      .[0]
      | select(.State.Running == true)
      | select(
          any(.NetworkSettings.Ports["8080/tcp"][]?; .HostPort == "8080")
          or (
            .HostConfig.NetworkMode == "host"
            and any(.Config.Env[]?; . == "PORT=8080")
          )
        )
      | .Id
    ' 2>/dev/null || true
  done
)

[[ "${#container_ids[@]}" -eq 1 ]] || {
  echo "Expected exactly one running root-owned container serving Hub port 8080; found ${#container_ids[@]}." >&2
  exit 65
}

container_id="${container_ids[0]}"
record="$(docker inspect "$container_id" | jq -c --arg version "$version" '
  .[0]
  | {
      audit: "bitcoinwalk-live-hub-boundary-v1",
      hubVersion: $version,
      containerName: (.Name | ltrimstr("/")),
      imageReference: .Config.Image,
      imageId: .Image,
      running: .State.Running,
      startedAt: .State.StartedAt,
      restartPolicy: .HostConfig.RestartPolicy.Name,
      networkMode: .HostConfig.NetworkMode,
      readOnlyRootFilesystem: .HostConfig.ReadonlyRootfs,
      configuredUser: .Config.User,
      port8080: [
        .NetworkSettings.Ports["8080/tcp"][]?
        | {hostIp: .HostIp, hostPort: .HostPort}
      ],
      mounts: [
        .Mounts[]?
        | {
            type: .Type,
            source: .Source,
            destination: .Destination,
            readWrite: .RW,
            propagation: .Propagation
          }
      ]
    }
')"

jq -e '
  .audit == "bitcoinwalk-live-hub-boundary-v1"
  and .running == true
  and (.imageId | startswith("sha256:"))
  and (.mounts | length > 0)
' >/dev/null <<<"$record" || {
  echo "Hub metadata is incomplete; refusing to claim the migration boundary is known." >&2
  exit 65
}

printf '%s\n' "$record" | jq .
printf '%s\n' "LIVE_HUB_BOUNDARY_READ_ONLY_OK"

