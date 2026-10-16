#!/usr/bin/env bash
set -euo pipefail
umask 077

known_hosts="/home/bitcoinwalk/.config/bitcoinwalk-hub-backup/known_hosts"
ssh_config="/home/bitcoinwalk/.config/bitcoinwalk-hub-backup/ssh_config"
host="213.232.235.138"
old_fingerprint="SHA256:Rn5WqprBhTBN0GvRrYS0efQddu0aW7gA3SbiA9ZdC3M"
new_fingerprint="SHA256:rV8nNjpNrk6tr0gNdLf1ZsO0tqPTJ8Ad7cdvQTnFcNY"
new_key="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDMQOcStwMT61seulSQsKAm/zPWYC5UraR+8CdfrfXnl"

[[ "$(id -u)" == "0" ]] || { echo "Root is required to update the protected transport pin." >&2; exit 77; }
[[ -f "$known_hosts" && ! -L "$known_hosts" ]] || { echo "Pinned known_hosts file is unsafe." >&2; exit 73; }
[[ "$(stat -c '%U:%G:%a' "$known_hosts")" == "bitcoinwalk:bitcoinwalk:600" ]] || { echo "Pinned known_hosts permissions changed." >&2; exit 73; }

current="$(ssh-keygen -F "$host" -f "$known_hosts" 2>/dev/null | grep -v '^#' | ssh-keygen -lf - | awk '{print $2}')"
[[ "$current" == "$old_fingerprint" || "$current" == "$new_fingerprint" ]] || {
  echo "Current backup-host pin is neither the reviewed predecessor nor replacement." >&2
  exit 65
}
if [[ "$current" == "$old_fingerprint" ]]; then
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup="$known_hosts.before-$stamp"
  cp -p -- "$known_hosts" "$backup"
  temporary="$known_hosts.new"
  awk -v host="$host" '$1 != host {print}' "$known_hosts" > "$temporary"
  printf '%s %s\n' "$host" "$new_key" >> "$temporary"
  chown bitcoinwalk:bitcoinwalk "$temporary"
  chmod 600 "$temporary"
  mv -f -- "$temporary" "$known_hosts"
else
  backup="already-current"
fi

updated="$(ssh-keygen -F "$host" -f "$known_hosts" 2>/dev/null | grep -v '^#' | ssh-keygen -lf - | awk '{print $2}')"
[[ "$updated" == "$new_fingerprint" ]] || { echo "Replacement host-key pin verification failed." >&2; exit 70; }
probe="$(runuser -u bitcoinwalk -- ssh -F "$ssh_config" hub-backup-receiver probe)"
[[ "$probe" == "bitcoinwalk-hub-backup-receiver-ready" ]] || { echo "Pinned receiver probe failed." >&2; exit 70; }
printf 'BACKUP_HOST_PIN_UPDATED fingerprint=%s backup=%s\n' "$new_fingerprint" "$backup"

