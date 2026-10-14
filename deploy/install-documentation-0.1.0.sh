#!/bin/bash
# Install one verified static documentation release on the production origin.
set -euo pipefail
umask 027

test "$(id -u)" -eq 0 || { echo 'Run with sudo on .138.' >&2; exit 1; }

script_dir=$(cd "$(dirname "$0")" && pwd)
package_dir=$(cd "$script_dir/.." && pwd)
site_source="$package_dir/site"
checksums="$package_dir/SHA256SUMS"
fragment_source="$script_dir/Caddyfile.documentation"
install_root=/opt/bitcoinwalk-documentation
releases="$install_root/releases"
current="$install_root/current"
live_caddy=/etc/caddy/Caddyfile
live_fragment=/etc/caddy/bitcoinwalk-documentation.caddy
import_line='import /etc/caddy/bitcoinwalk-documentation.caddy'

test -f "$site_source/index.html"
test -f "$site_source/sitemap-index.xml"
test -f "$site_source/pagefind/pagefind.js"
test -f "$checksums"
test -f "$fragment_source"
test -f "$live_caddy"
test -z "$(find "$site_source" -type l -print -quit)" || { echo 'Documentation package must not contain symlinks.' >&2; exit 1; }
(cd "$package_dir" && sha256sum --check SHA256SUMS)

release_hash=$(sha256sum "$checksums" | cut -d' ' -f1)
release_name="0.1.0-${release_hash:0:16}"
release="$releases/$release_name"
backup=$(mktemp -d /var/backups/bitcoinwalk-documentation.XXXXXX)
install -m 0600 "$live_caddy" "$backup/Caddyfile.before"
if test -e "$live_fragment"; then
	install -m 0600 "$live_fragment" "$backup/fragment.before"
fi
if test -L "$current"; then
	readlink -f "$current" >"$backup/current.before"
fi

rollback() {
	status=$?
	if test "$status" -ne 0; then
		install -o root -g root -m 0644 "$backup/Caddyfile.before" "$live_caddy" || true
		if test -f "$backup/fragment.before"; then
			install -o root -g root -m 0644 "$backup/fragment.before" "$live_fragment" || true
		else
			rm -f "$live_fragment"
		fi
		if test -f "$backup/current.before"; then
			previous=$(cat "$backup/current.before")
			ln -s "$previous" "$current.rollback.$$"
			mv -Tf "$current.rollback.$$" "$current"
		else
			rm -f "$current"
		fi
		caddy validate --config "$live_caddy" --adapter caddyfile >/dev/null 2>&1 && systemctl reload caddy || true
		echo "Documentation installation failed; prior Caddy and release restored. Backup: $backup" >&2
	fi
	exit "$status"
}
trap rollback EXIT

install -d -o root -g caddy -m 0750 "$install_root" "$releases"
if ! test -d "$release"; then
	install -d -o root -g caddy -m 0750 "$release"
	cp -a "$site_source/." "$release/"
	find "$release" -type d -exec chown root:caddy {} + -exec chmod 0750 {} +
	find "$release" -type f -exec chown root:caddy {} + -exec chmod 0640 {} +
fi

ln -s "$release" "$current.next.$$"
mv -Tf "$current.next.$$" "$current"
chown -h root:caddy "$current"

install -o root -g root -m 0644 "$fragment_source" "$live_fragment"
candidate="$backup/Caddyfile.candidate"
cp "$live_caddy" "$candidate"
if ! grep -Fqx "$import_line" "$candidate"; then
	printf '\n%s\n' "$import_line" >>"$candidate"
fi
caddy fmt --overwrite "$candidate"
caddy validate --config "$candidate" --adapter caddyfile
install -o root -g root -m 0644 "$candidate" "$live_caddy"
systemctl reload caddy

curl --fail --silent --show-error --max-time 10 \
	-H 'Host: docs.bitcoinwalk.org' http://127.0.0.1/ >"$backup/docs-home.html"
grep -Fq 'BitcoinWalk Documentation' "$backup/docs-home.html"
curl --silent --show-error --max-time 10 -D "$backup/help-headers.txt" -o /dev/null \
	-H 'Host: help.bitcoinwalk.org' http://127.0.0.1/
grep -Eqi '^location: https://docs\.bitcoinwalk\.org/?' "$backup/help-headers.txt"

find "$releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
	| sort -nr | tail -n +4 | cut -d' ' -f2- >"$backup/old-releases.txt"
while IFS= read -r old_release; do
	test -n "$old_release" || continue
	test "$old_release" != "$(readlink -f "$current")" || continue
	rm -rf -- "$old_release"
done <"$backup/old-releases.txt"

sha256sum "$checksums" "$fragment_source" "$live_caddy" >"$backup/accepted.sha256"
trap - EXIT
echo "BitcoinWalk documentation $release_name accepted. Backup: $backup"
echo 'The origin is ready for docs.bitcoinwalk.org and help.bitcoinwalk.org proxy routes.'
