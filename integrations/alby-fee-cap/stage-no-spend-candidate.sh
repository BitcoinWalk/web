#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" == "0" ]]; then echo "Non-root only" >&2; exit 1; fi
if [[ $# -ne 2 ]]; then echo "usage: $0 ARCHIVE ABSOLUTE_CANDIDATE_ROOT" >&2; exit 1; fi
archive="$(readlink -f -- "$1")"; root="$2"
[[ -f "$archive" && "$root" == /* && "$root" != "/" ]] || { echo "Invalid archive or target" >&2; exit 1; }
[[ ! -L "$root" ]] || { echo "Target root must not be a symlink" >&2; exit 1; }
mkdir -p -- "$root/releases" "$root/state"
[[ -O "$root" && -O "$root/releases" && -O "$root/state" ]] || { echo "Candidate directories must be owned by the current user" >&2; exit 1; }
[[ -z "$(find "$root/state" -mindepth 1 -maxdepth 1 -print -quit)" ]] || { echo "Refusing non-empty candidate state; never point this installer at live Hub data" >&2; exit 1; }
archive_listing="$(tar -tzf "$archive")"
if grep -Eq '(^/|(^|/)\.\.(/|$))' <<< "$archive_listing"; then echo "Unsafe archive paths" >&2; exit 1; fi
archive_types="$(LC_ALL=C tar -tvzf "$archive")"
if grep -Eq '^[^d-]' <<< "$archive_types"; then echo "Archive links and special files are not allowed" >&2; exit 1; fi
stage="$(mktemp -d "$root/releases/.stage.XXXXXX")"
trap 'rm -rf -- "$stage"' EXIT
tar -xzf "$archive" -C "$stage" --no-same-owner --no-same-permissions
mapfile -t releases < <(find "$stage" -mindepth 1 -maxdepth 1 -type d -print)
[[ ${#releases[@]} -eq 1 ]] || { echo "Invalid candidate layout" >&2; exit 1; }
release="${releases[0]}"
[[ -f "$release/manifest.json" && -f "$release/SHA256SUMS" ]] || { echo "Invalid candidate layout" >&2; exit 1; }
(cd "$release" && sha256sum -c SHA256SUMS)
grep -q '"productionReady": false' "$release/manifest.json" || { echo "Candidate safety marker missing" >&2; exit 1; }
grep -q '"startEnabled": false' "$release/manifest.json" || { echo "Candidate start gate missing" >&2; exit 1; }
name="$(basename "$release")"; destination="$root/releases/$name"
[[ ! -e "$destination" ]] || { echo "Release already staged" >&2; exit 1; }
mv -- "$release" "$destination"
if [[ -L "$root/current" ]]; then readlink -f -- "$root/current" > "$root/previous"; fi
ln -s -- "$destination" "$root/.current.new"
mv -Tf -- "$root/.current.new" "$root/current"
printf '%s\n' "Staged $name. It is not running and has no wallet configuration."
