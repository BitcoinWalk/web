#!/usr/bin/env bash
set -euo pipefail
umask 077

live_container="albyhub"
live_image="sha256:2982a75a63c4dace6e203ee4cd803f8481f236ebf5ec50c4e2d0f8711e79869a"
live_root="/var/lib/docker/volumes/albyhub-data/_data"
candidate_revision="6bb8520025d781f8570ef1a5d134fe545a1586f3ab46cfedd780e15a641cfa84"
config_dir="/home/bitcoinwalk/.config/bitcoinwalk-hub-backup"
spool="/home/bitcoinwalk/.local/state/bitcoinwalk-hub-live-backup"
recipient="$config_dir/recipient-public.asc"
ssh_config="$config_dir/ssh_config"

[[ "$(id -u)" == "0" ]] || { echo "Root is required for a consistent live-volume backup." >&2; exit 77; }
[[ $# -eq 1 && "$1" == "--approved-stop-encrypt-upload" ]] || {
  echo "usage: $0 --approved-stop-encrypt-upload" >&2
  exit 64
}
for required in docker curl jq gpg runuser ssh tar timeout; do
  command -v "$required" >/dev/null 2>&1 || { echo "$required is required." >&2; exit 69; }
done
[[ "$(docker inspect "$live_container" --format '{{.Image}}')" == "$live_image" ]] || { echo "Live Hub image identity changed." >&2; exit 65; }
[[ "$(docker inspect "$live_container" --format '{{.State.Running}}')" == "true" ]] || { echo "Live Hub container is not running." >&2; exit 65; }
[[ -d "$live_root/albyhub" && -f "$live_root/albyhub/nwc.db" && ! -L "$live_root" ]] || { echo "Live Hub volume boundary changed." >&2; exit 65; }
[[ -f "$recipient" && -f "$ssh_config" ]] || { echo "Backup recipient or restricted transport is missing." >&2; exit 69; }
[[ "$(stat -c '%U:%G:%a' "$recipient")" == "bitcoinwalk:bitcoinwalk:600" ]] || { echo "Public recipient permissions changed." >&2; exit 73; }
[[ "$(stat -c '%U:%G:%a' "$ssh_config")" == "bitcoinwalk:bitcoinwalk:600" ]] || { echo "Restricted SSH configuration permissions changed." >&2; exit 73; }

live_info="$(curl -fsS --max-time 8 http://127.0.0.1:8080/api/info)"
jq -e '.version == "v1.24.0" and .setupCompleted == true and .running == true and .network == "bitcoin"' >/dev/null <<<"$live_info" || {
  echo "Live Hub must be running and unlocked before backup." >&2
  exit 70
}

install -d -m 700 -o bitcoinwalk -g bitcoinwalk -- "$spool"
gnupg_home="$(mktemp -d)"
manifest_dir="$(mktemp -d)"
temporary=""
was_running=true
restart_live() {
  if [[ "$was_running" == "true" && "$(docker inspect "$live_container" --format '{{.State.Running}}' 2>/dev/null || true)" != "true" ]]; then
    docker start "$live_container" >/dev/null || true
  fi
}
cleanup() {
  status=$?
  trap - EXIT INT TERM
  restart_live
  [[ -z "$temporary" ]] || rm -f -- "$temporary"
  chmod -R u+rwX "$gnupg_home" "$manifest_dir" 2>/dev/null || true
  rm -rf -- "$gnupg_home" "$manifest_dir"
  exit "$status"
}
trap cleanup EXIT INT TERM
chmod 700 "$gnupg_home" "$manifest_dir"

if gpg --batch --homedir "$gnupg_home" --import-options show-only --with-colons --import "$recipient" | grep -q '^sec:'; then
  echo "Recipient file must never contain a private key." >&2
  exit 65
fi
gpg --batch --quiet --homedir "$gnupg_home" --import "$recipient"
fingerprint="$(gpg --batch --homedir "$gnupg_home" --with-colons --list-keys | awk -F: '$1=="fpr" {print $10; exit}')"
public_count="$(gpg --batch --homedir "$gnupg_home" --with-colons --list-keys | awk -F: '$1=="pub" {n++} END {print n+0}')"
[[ "$public_count" -eq 1 && "$fingerprint" == "A206D095A5885B490A359B8195B95ADD2B41B188" ]] || {
  echo "Pinned public backup recipient changed." >&2
  exit 65
}

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
live_short="${live_image#sha256:}"; live_short="${live_short:0:12}"
candidate_short="${candidate_revision:0:12}"
name="hub-live-$timestamp-$live_short-$candidate_short.tar.zst.gpg"
archive="$spool/$name"
temporary="$archive.tmp"
[[ ! -e "$archive" && ! -e "$temporary" ]] || { echo "Backup name already exists." >&2; exit 73; }
printf 'format=bitcoinwalk-live-hub-backup-v1\nlive_image=%s\ncandidate_revision=%s\ncreated=%s\n' \
  "$live_image" "$candidate_revision" "$timestamp" > "$manifest_dir/manifest.txt"

timeout 180 docker stop --time 120 "$live_container" >/dev/null
[[ "$(docker inspect "$live_container" --format '{{.State.Running}}')" == "false" ]] || exit 70
tar --zstd --numeric-owner --acls --xattrs --one-file-system \
  --transform='s,^\.$,state,;s,^\./,state/,' \
  -C "$live_root" -cf - . -C "$manifest_dir" manifest.txt \
  | gpg --batch --quiet --homedir "$gnupg_home" --trust-model always \
      --recipient "$fingerprint" --encrypt --output "$temporary"
chmod 600 "$temporary"
chown bitcoinwalk:bitcoinwalk "$temporary"
mv -- "$temporary" "$archive"
temporary=""

docker start "$live_container" >/dev/null
service_ready=false
for _ in $(seq 1 60); do
  if live_after="$(curl -fsS --max-time 3 http://127.0.0.1:8080/api/info 2>/dev/null)" \
    && jq -e '.version == "v1.24.0" and .setupCompleted == true' >/dev/null <<<"$live_after"; then
    service_ready=true
    break
  fi
  sleep 1
done
[[ "$service_ready" == "true" ]] || { echo "Live Hub web service did not return after backup." >&2; exit 70; }

sha256="$(sha256sum "$archive" | cut -d' ' -f1)"
size="$(stat -c '%s' "$archive")"
receipt="$(runuser -u bitcoinwalk -- ssh -F "$ssh_config" hub-backup-receiver "upload $name" < "$archive")"
[[ "$receipt" == "stored $name $sha256 $size" ]] || { echo "Off-host receiver receipt mismatch." >&2; exit 70; }
printf '%s %s %s %s\n' "$timestamp" "$name" "$sha256" "$size" > "$spool/last-success"
chown bitcoinwalk:bitcoinwalk "$spool/last-success"
chmod 600 "$spool/last-success"
find "$spool" -maxdepth 1 -type f -name 'hub-live-*.tar.zst.gpg' -mtime +2 -delete

rm -rf -- "$gnupg_home" "$manifest_dir"
trap - EXIT INT TERM
printf 'LIVE_HUB_ENCRYPTED_BACKUP_OK name=%s bytes=%s manual_unlock_required=yes\n' "$name" "$size"

