#!/bin/sh
set -eu
[ "$(id -u)" -ne 0 ]&&[ "$(id -un)" = bitcoinwalk ]||exit 1;sha256sum -c SHA256SUMS >/dev/null
lib="$HOME/.local/libexec/bitcoinwalk-journal-operation";units="$HOME/.config/systemd/user";mkdir -p "$lib";chmod 700 "$lib"
install -m 700 control.cjs "$lib/control.cjs";install -m 700 start.sh "$lib/start.sh";install -m 700 monitor.sh "$lib/monitor.sh";install -m 700 pause.sh "$lib/pause.sh"
install -m 600 bitcoinwalk-payout-journal-operation-expiry.service bitcoinwalk-payout-journal-operation-expiry.timer bitcoinwalk-payout-journal-operation-monitor.service bitcoinwalk-payout-journal-operation-monitor.timer "$units/"
systemctl --user daemon-reload
printf '%s\n' 'Payout journal operation controller installed. The journal state was not changed.'
