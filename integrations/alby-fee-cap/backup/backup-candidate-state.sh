#!/usr/bin/env bash
set -euo pipefail
umask 077

candidate="6bb8520025d781f8570ef1a5d134fe545a1586f3ab46cfedd780e15a641cfa84"
container="bitcoinwalk-hub-feecap-candidate"
root="${BW_CANDIDATE_ROOT:-/home/bitcoinwalk/hub-feecap-candidate-6bb8520025d7}"
config_dir="${BW_BACKUP_CONFIG_DIR:-/home/bitcoinwalk/.config/bitcoinwalk-hub-backup}"
spool="${BW_BACKUP_SPOOL_DIR:-/home/bitcoinwalk/.local/state/bitcoinwalk-hub-backup}"
recipient="$config_dir/recipient-public.asc"
ssh_config="$config_dir/ssh_config"

[[ "$(id -u)" != "0" ]] || { echo "Non-root only" >&2; exit 1; }
[[ ! -L "$root" && -O "$root" && -d "$root/state" ]] || { echo "Unsafe candidate root" >&2; exit 1; }
[[ -f "$root/image.id" && "$(cat "$root/image.id")" == "$(docker inspect "$container" --format '{{.Image}}')" ]] || {
  echo "Candidate image identity mismatch" >&2
  exit 1
}
[[ -f "$recipient" && -f "$ssh_config" ]] || { echo "Backup recipient or transport is not configured" >&2; exit 1; }
mkdir -p -m 700 -- "$spool"

gnupg_home="$(mktemp -d)"
snapshot_dir="$(mktemp -d)"
trap 'rm -rf -- "$gnupg_home" "$snapshot_dir"' EXIT
chmod 700 "$gnupg_home" "$snapshot_dir"
if gpg --batch --homedir "$gnupg_home" --import-options show-only --with-colons --import "$recipient" | grep -q '^sec:'; then
  echo "Recipient file must never contain a private key" >&2
  exit 1
fi
gpg --batch --quiet --homedir "$gnupg_home" --import "$recipient"
fingerprint="$(gpg --batch --homedir "$gnupg_home" --with-colons --list-keys | awk -F: '$1=="fpr" {print $10; exit}')"
public_count="$(gpg --batch --homedir "$gnupg_home" --with-colons --list-keys | awk -F: '$1=="pub" {n++} END {print n+0}')"
[[ "$public_count" -eq 1 && "$fingerprint" =~ ^[0-9A-Fa-f]{40}$ ]] || { echo "Exactly one usable public recipient is required" >&2; exit 1; }

was_running="$(docker inspect "$container" --format '{{.State.Running}}')"
restart_if_needed() {
  if [[ "$was_running" == "true" && "$(docker inspect "$container" --format '{{.State.Running}}')" != "true" ]]; then
    docker start "$container" >/dev/null
  fi
}
trap 'restart_if_needed; rm -rf -- "$gnupg_home" "$snapshot_dir"' EXIT
if [[ "$was_running" == "true" ]]; then
  docker stop --time 300 "$container" >/dev/null
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
short="${candidate:0:12}"
name="hub-feecap-$timestamp-$short.tar.zst.gpg"
archive="$spool/$name"
printf 'candidate=%s\nimage=%s\ncreated=%s\n' "$candidate" "$(cat "$root/image.id")" "$timestamp" > "$snapshot_dir/manifest.txt"
tar --zstd --numeric-owner --acls --xattrs -C "$root" -cf - state image.id container-manifest.json \
  -C "$snapshot_dir" manifest.txt \
  | gpg --batch --quiet --homedir "$gnupg_home" --trust-model always --recipient "$fingerprint" --encrypt --output "$archive"
chmod 600 "$archive"
restart_if_needed

sha256="$(sha256sum "$archive" | cut -d' ' -f1)"
size="$(stat -c '%s' "$archive")"
receipt="$(ssh -F "$ssh_config" hub-backup-receiver "upload $name" < "$archive")"
[[ "$receipt" == "stored $name $sha256 $size" ]] || { echo "Remote receipt mismatch" >&2; exit 1; }
printf '%s %s %s\n' "$timestamp" "$sha256" "$size" > "$spool/last-success"
chmod 600 "$spool/last-success"
find "$spool" -maxdepth 1 -type f -name 'hub-feecap-*.tar.zst.gpg' -mtime +2 -delete
printf '%s\n' "Encrypted off-host backup stored and verified: $name"
