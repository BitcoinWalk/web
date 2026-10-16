#!/usr/bin/env bash
set -euo pipefail

revision="6bb8520025d781f8570ef1a5d134fe545a1586f3ab46cfedd780e15a641cfa84"
marker="/data/.bitcoinwalk-feecap-production"

[[ "${BW_FEE_CAP_CUTOVER:-disabled}" == "approved-production" ]] || {
  echo "Production fee-cap start is not approved." >&2
  exit 78
}
[[ $# -eq 1 && "$1" == "/opt/bitcoinwalk-hub/bin/albyhub" ]] || {
  echo "Only the reviewed Hub server command is allowed." >&2
  exit 1
}
[[ "${WORK_DIR:-}" == "/data/albyhub" && "${PORT:-}" == "8080" ]] || {
  echo "Unexpected production work directory or port." >&2
  exit 1
}
[[ -f "$marker" && ! -L "$marker" && "$(cat "$marker")" == "$revision" ]] || {
  echo "The reviewed production state marker is absent or does not match." >&2
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
