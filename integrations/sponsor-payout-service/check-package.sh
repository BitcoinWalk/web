#!/usr/bin/env sh
set -eu
here=$(CDPATH= cd -- "$(dirname "$0")"&&pwd)
for name in install-disabled.sh backup-state.sh monitor-disabled.sh;do sh -n "$here/$name";done
grep -q 'version=0.1.1' "$here/install-disabled.sh"
grep -q -- '--network none' "$here/install-disabled.sh"
grep -q -- '--read-only' "$here/install-disabled.sh"
grep -q -- '--cap-drop ALL' "$here/install-disabled.sh"
grep -q 'org.bitcoinwalk.mode=disabled' "$here/install-disabled.sh"
grep -Eq 'credentialLoaded: *false' "$here/sponsor-payout-service.cjs"
grep -Eq 'hostInvitationsEnabled: *false' "$here/sponsor-payout-service.cjs"
grep -Eq 'restartReconciliation: *"blocked-disabled"' "$here/sponsor-payout-service.cjs"
! grep -qE 'nostr.walletconnect|nwc-uri|BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED=1' "$here/sponsor-payout-service.cjs"
! grep -q 'docker ' "$here/backup-state.sh"
! grep -q 'docker ' "$here/monitor-disabled.sh"
printf '%s\n' 'Sponsor payout disabled package policy checks passed.'
