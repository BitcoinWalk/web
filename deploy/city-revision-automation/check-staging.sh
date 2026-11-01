#!/bin/bash
set -euo pipefail
umask 077
test "$(id -un)" = bitcoinwalk || { echo 'Run as bitcoinwalk, without sudo.' >&2; exit 1; }
node=/opt/bitcoinwalk-app-staging/runtime/bin/node
worker=/opt/bitcoinwalk-city-revision-automation/0.1.0/city-revision-automation.cjs
environment="$HOME/.config/bitcoinwalk/app.env"
test -x "$node" && test -r "$worker" && test -r "$environment"
test ! -e /opt/bitcoinwalk-city-revision-automation/0.1.0/policy.json
test ! -e /opt/bitcoinwalk-city-revision-automation/0.1.0/signer-key
set -a
source "$environment"
set +a
unset CREDENTIALS_DIRECTORY BITCOINWALK_PAYMENT_DATABASE BITCOINWALK_RUSTRESS_FIXTURE_ENABLED BITCOINWALK_RUSTRESS_MANAGED_ENABLED
export BITCOINWALK_CITY_REVISION_AUTOMATION_ENVIRONMENT=staging
exec "$node" "$worker" --dry-run
