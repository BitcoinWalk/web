#!/bin/bash
# Sourced by both activators. Keep fd 9 open through health/evidence checks.
# Caller supplies profile, release, archive, releases, current, runtime, expected_current.
app_deploy_guard() {
  [[ "$release" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid release version.' >&2; return 1; }
  exec 9>"$releases/.deploy.lock"
  flock -n 9 || { echo 'Another deployment is in progress.' >&2; return 1; }
  test -n "$expected_current" && test "$(readlink -f "$current")" = "$expected_current" || {
    echo 'Active release changed or --expected-current was omitted. Reconcile before deploying.' >&2; return 1;
  }
  # Snapshot first; never hash one upload and later extract a concurrently replaced upload.
  deploy_snapshot=$(mktemp -d "$releases/.deploy-input.XXXXXX")
  trap 'rm -rf -- "$deploy_snapshot"' EXIT
  local original="$archive" base expected_digest
  base=$(basename "$archive")
  expected_digest=$(awk -v name="$base" 'NF==2 && $2==name {print $1}' "$original.sha256")
  [[ "$expected_digest" =~ ^[a-f0-9]{64}$ ]] || { echo 'Invalid checksum sidecar.' >&2; return 1; }
  cp -- "$original" "$deploy_snapshot/$base"
  archive="$deploy_snapshot/$base"
  digest=$(sha256sum "$archive" | cut -d' ' -f1)
  test "$digest" = "$expected_digest" || { echo 'Upload checksum mismatch.' >&2; return 1; }
  local existing
  for existing in "$releases/$release-"*; do
    test ! -e "$existing" || test "$existing" = "$releases/$release-${digest:0:12}" || {
      echo 'Release version already exists with different contents. Use a new version.' >&2; return 1;
    }
  done
  mkdir -p "$releases/.release-digests"
  local registry="$releases/.release-digests/$release"
  if test -f "$registry"; then
    test "$(cat "$registry")" = "$digest" || { echo 'Release version is reserved for different contents.' >&2; return 1; }
  fi
  tar -xOf "$archive" ./release-manifest.json >"$deploy_snapshot/manifest.json"
  "$runtime" "$(dirname "${BASH_SOURCE[0]}")/validate-app-manifest.mjs" "$deploy_snapshot/manifest.json" "$current/release-manifest.json" "$profile" "$release"
  printf '%s\n' "$digest" >"$registry"
  target="$releases/$release-${digest:0:12}"
}
