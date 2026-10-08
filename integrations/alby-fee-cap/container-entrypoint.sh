#!/usr/bin/env bash
set -euo pipefail

candidate="6bb8520025d781f8570ef1a5d134fe545a1586f3ab46cfedd780e15a641cfa84"
marker="/data/.bitcoinwalk-no-spend-candidate"

if [[ "${BW_CANDIDATE_START:-disabled}" != "reviewed-no-spend" ]]; then
  echo "Candidate container is staged but start is disabled." >&2
  exit 78
fi

[[ $# -eq 1 && "$1" == "/opt/bitcoinwalk-hub/bin/albyhub" ]] || {
  echo "Only the reviewed Hub server command is allowed" >&2
  exit 1
}
[[ "${WORK_DIR:-}" == "/data/albyhub" && "${PORT:-}" == "8080" ]] || {
  echo "Unexpected candidate work directory or port" >&2
  exit 1
}
[[ -f "$marker" && "$(cat "$marker")" == "$candidate" ]] || {
  echo "Candidate state marker is absent or does not match" >&2
  exit 1
}

for forbidden in \
  AUTO_UNLOCK_PASSWORD DATABASE_URI LN_BACKEND_TYPE \
  LND_ADDRESS LND_CERT_FILE LND_MACAROON_FILE \
  LDK_BITCOIND_RPC_HOST LDK_BITCOIND_RPC_PORT LDK_BITCOIND_RPC_USER LDK_BITCOIND_RPC_PASSWORD \
  PHOENIXD_ADDRESS PHOENIXD_AUTHORIZATION \
  CLN_ADDRESS CLN_LIGHTNING_DIR CLN_ADDRESS_HOLD \
  BARK_SERVER_ACCESS_TOKEN; do
  if [[ -n "${!forbidden+x}" ]]; then
    echo "Forbidden wallet or automatic-unlock configuration: $forbidden" >&2
    exit 1
  fi
done

exec "$1"
