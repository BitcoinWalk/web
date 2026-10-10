#!/bin/sh
set -eu
here=$(CDPATH= cd -- "$(dirname "$0")"&&pwd);sh -n "$here/install.sh";sh -n "$here/watchdog.sh"
grep -q 'restore.sh' "$here/watchdog.sh";grep -q 'watchdog.sh' "$here/bitcoinwalk-payout-operation-monitor.service"
printf '%s\n' 'Payout watchdog package policy checks passed.'
