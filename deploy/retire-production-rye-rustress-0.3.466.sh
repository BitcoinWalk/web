#!/usr/bin/env bash
set -euo pipefail

city='530af607-e1c8-47f4-a5af-c200a965420b'
local_part='rye'
managed_db='/home/bitcoinwalk/rustress-managed/state/bitcoinwalk.managed.sqlite'
ledger_db='/home/bitcoinwalk/.local/state/bitcoinwalk-rustress/payout-service/ledger.sqlite'
token_file='/home/bitcoinwalk/rustress-managed/secrets/provision-api-token'

test "$(id -un)" = bitcoinwalk
test -f "$managed_db"
test -f "$ledger_db"
test -f "$token_file"
systemctl --user is-active --quiet bitcoinwalk-rustress-managed.service

pending="$({ sqlite3 -readonly "$ledger_db" <<SQL
WITH rye AS (
  SELECT hash FROM bw_ledger_invoice
  WHERE json_extract(bucket,'$.cityId')='$city'
), allocations AS (
  SELECT DISTINCT a.payout FROM rye r JOIN bw_ledger_allocation a ON a.hash=r.hash
)
SELECT COUNT(*) FROM allocations a JOIN bw_ledger_payout p ON p.id=a.payout
WHERE p.state IN ('prepared','unknown');
SQL
} | tr -d '[:space:]')"
test "$pending" = 0

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="/home/bitcoinwalk/backups/retire-production-rye-$stamp"
install -d -m 0700 "$backup"
sqlite3 "$managed_db" ".backup '$backup/bitcoinwalk.managed.sqlite'"
sqlite3 "$ledger_db" ".backup '$backup/ledger.sqlite'"

work="$(mktemp -d /home/bitcoinwalk/incoming/retire-rye.XXXXXX)"
chmod 0700 "$work"
cleanup(){ rm -f "$work/config.json" "$work/request.json" "$work/response.json"; rmdir "$work" 2>/dev/null || true; }
trap cleanup EXIT

current="$(sqlite3 -readonly "$managed_db" "SELECT config FROM bw_configs WHERE city_id='$city' AND state='applied' ORDER BY version DESC LIMIT 1;")"
test -n "$current"
printf '%s' "$current" | python3 -c '
import json,sys
value=json.load(sys.stdin)
assert value["cityId"]==sys.argv[1] and value["localPart"]==sys.argv[2]
assert value["domain"]=="bitcoinwalk.org"
assert value["version"] in (2,3)
if value["version"]==2:
    assert value["invoiceIssuance"]=="enabled"
    value["version"]=3
else:
    assert value["invoiceIssuance"]=="disabled"
value["invoiceIssuance"]="disabled"
json.dump(value,sys.stdout,separators=(",",":"))
' "$city" "$local_part" >"$work/config.json"
chmod 0600 "$work/config.json"

provider_version="$(sqlite3 -readonly "$managed_db" "SELECT version FROM bw_configs WHERE city_id='$city' AND state='applied' ORDER BY version DESC LIMIT 1;")"
if test "$provider_version" = 2; then
  python3 - "$work/config.json" >"$work/request.json" <<'PY'
import hashlib,json,sys
with open(sys.argv[1],encoding="utf-8") as source:
    config=json.load(source)
canonical=json.dumps(config,separators=(",",":"))
digest=hashlib.sha256(canonical.encode()).hexdigest()
json.dump({"api":"bitcoinwalk-provisioning-v1","expectedVersion":2,
           "idempotencyKey":f'{config["cityId"]}:3:{digest}',"config":config},sys.stdout,separators=(",",":"))
PY
  chmod 0600 "$work/request.json"
  token="$(<"$token_file")"
  for action in prepare apply; do
    curl --fail-with-body --silent --show-error --max-time 15 \
      -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
      --data-binary "@$work/request.json" "http://127.0.0.1:8895/v1/bitcoinwalk/cities/$city/$action" >"$work/response.json"
    python3 - "$work/response.json" "$city" <<'PY'
import json,sys
with open(sys.argv[1],encoding="utf-8") as source:
    value=json.load(source)
assert value["cityId"]==sys.argv[2] and value["version"]==3
assert value["invoiceIssuance"]=="disabled"
assert value["state"] in ("prepared","applied")
PY
  done
fi

test "$(sqlite3 -readonly "$managed_db" "SELECT COUNT(*) FROM bw_configs WHERE city_id='$city' AND version=3 AND state='applied' AND json_extract(config,'$.localPart')='$local_part' AND json_extract(config,'$.invoiceIssuance')='disabled';")" = 1

authority="$(sqlite3 -readonly "$ledger_db" "SELECT COUNT(*) FROM bw_payout_authority WHERE city='$city';")"
if test "$authority" = 1; then
  changed="$(sqlite3 "$ledger_db" "BEGIN IMMEDIATE; DELETE FROM bw_payout_authority WHERE city='$city' AND json_extract(document,'$.localPart')='$local_part' AND json_extract(document,'$.invoiceIssuance')='enabled'; SELECT changes(); COMMIT;")"
  test "$changed" = 1
else
  test "$authority" = 0
fi
test "$(sqlite3 -readonly "$ledger_db" "SELECT COUNT(*) FROM bw_payout_authority WHERE city='$city';")" = 0

echo "RYE_RUSTRESS_RETIRED city=$city provider_version=3 invoice_issuance=disabled payout_authority=absent backup=$backup"
