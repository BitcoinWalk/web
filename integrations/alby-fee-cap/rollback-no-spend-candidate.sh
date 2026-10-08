#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" == "0" ]]; then echo "Non-root only" >&2; exit 1; fi
if [[ $# -ne 1 || "$1" != /* || "$1" == "/" ]]; then echo "usage: $0 ABSOLUTE_CANDIDATE_ROOT" >&2; exit 1; fi
root="$1"; [[ ! -L "$root" && -O "$root" && -f "$root/previous" ]] || { echo "No owned rollback target" >&2; exit 1; }
previous="$(cat "$root/previous")"
[[ "$previous" == "$root/releases/"* && -d "$previous" && -f "$previous/SHA256SUMS" ]] || { echo "Invalid rollback target" >&2; exit 1; }
(cd "$previous" && sha256sum -c SHA256SUMS)
ln -s -- "$previous" "$root/.current.rollback"
mv -Tf -- "$root/.current.rollback" "$root/current"
printf '%s\n' "Rolled staged pointer back to $(basename "$previous"). No service was started or stopped."
