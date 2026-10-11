#!/bin/sh
# Runs only in a new temporary fixture directory; never touches installed services.
set -eu
test "$(id -u)" -ne 0
docker info --format '{{json .SecurityOptions}}' | grep -q 'name=rootless'
here=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
for file in rustress-receipt-worker.cjs rustress-receipt-signer.cjs rehearse-receipt-docker-fixture.cjs; do test -f "$here/$file"; done
fixture=$(mktemp -d /tmp/bw-receipt-docker.XXXXXXXX)
chmod 700 "$fixture"
prefix="bw-receipt-fixture-$(basename "$fixture" | tr . -)"
image='node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1'
cleanup() {
 for role in worker signer boundaries; do docker rm -f "$prefix-$role" >/dev/null 2>&1 || true; done
 # Only disposable, random fixture keys and state live here. Keep files for inspection.
 printf 'Synthetic fixture files retained at %s\n' "$fixture"
}
trap cleanup EXIT HUP INT TERM
run_fixture() { docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 64 --memory 192m --mount "type=bind,src=$here,dst=/app,readonly" --mount "type=bind,src=$fixture,dst=/fixture" "$image" node /app/rehearse-receipt-docker-fixture.cjs "$1"; }
run_fixture init
docker run -d --name "$prefix-boundaries" --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 64 --memory 192m --mount "type=bind,src=$here,dst=/app,readonly" --mount "type=bind,src=$fixture,dst=/fixture" "$image" node /app/rehearse-receipt-docker-fixture.cjs serve >/dev/null
docker run -d --name "$prefix-signer" --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 64 --memory 192m --mount "type=bind,src=$here,dst=/app,readonly" --mount "type=bind,src=$fixture/signer-config,dst=/run/bitcoinwalk-receipt-signer/config,readonly" --mount "type=bind,src=$fixture/signer-secrets,dst=/run/bitcoinwalk-receipt-signer/secrets,readonly" --mount "type=bind,src=$fixture/signer-state,dst=/var/lib/bitcoinwalk-receipt-signer" --mount "type=bind,src=$fixture/signer-socket,dst=/run/bitcoinwalk-receipt-signer/socket" "$image" node /app/rustress-receipt-signer.cjs >/dev/null
n=0
until test -S "$fixture/signer-socket/signer.sock" && test -S "$fixture/evidence-socket/evidence.sock" && test -S "$fixture/egress-socket/relay.sock"; do n=$((n+1)); test "$n" -lt 15; sleep 1; done
docker run -d --name "$prefix-worker" --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 64 --memory 192m --mount "type=bind,src=$here,dst=/app,readonly" --mount "type=bind,src=$fixture/worker-config,dst=/run/bitcoinwalk-receipt-worker/config,readonly" --mount "type=bind,src=$fixture/worker-secrets,dst=/run/bitcoinwalk-receipt-worker/secrets,readonly" --mount "type=bind,src=$fixture/worker-state,dst=/var/lib/bitcoinwalk-receipt-worker" --mount "type=bind,src=$fixture/worker-socket,dst=/run/bitcoinwalk-receipt-worker/socket" --mount "type=bind,src=$fixture/signer-socket,dst=/run/bitcoinwalk-receipt-signer/socket,readonly" --mount "type=bind,src=$fixture/evidence-socket,dst=/run/bitcoinwalk-payout-evidence/socket,readonly" --mount "type=bind,src=$fixture/egress-socket,dst=/run/bitcoinwalk-receipt-egress/socket,readonly" "$image" node /app/rustress-receipt-worker.cjs >/dev/null
n=0
until test -S "$fixture/worker-socket/intake.sock"; do n=$((n+1)); test "$n" -lt 15; sleep 1; done
run_fixture enqueue
n=0
until run_fixture signed; do n=$((n+1)); test "$n" -lt 20; sleep 2; done
docker stop "$prefix-worker" >/dev/null
run_fixture allow
docker start "$prefix-worker" >/dev/null
n=0
until run_fixture published; do n=$((n+1)); test "$n" -lt 25; sleep 2; done
for role in worker signer boundaries; do test "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$prefix-$role")" = none; done
run_fixture verify
