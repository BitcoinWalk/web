#!/usr/bin/env bash
# Back up the live production bbolt relay and prove the recovered copy starts
# and serves the same signed event set without changing live state.
set -euo pipefail

test "$(id -u)" -eq 0

service=bitcoinwalk-relay-production.service
state=/var/lib/bitcoinwalk-relay-production
database=$state/events.db
binary=/opt/bitcoinwalk-relay-production/bitcoinwalk-relay
unit=/etc/systemd/system/bitcoinwalk-relay-production.service
node=/home/bitcoinwalk/apps/bitcoinwalk-production/runtime/bin/node
listen=127.0.0.1:3398
backup=$(mktemp -d /var/backups/bitcoinwalk-production-relay-recovery.XXXXXX)
restore=$backup/restored
started_at=$(date +%s)
pid=

cleanup() {
  if test -n "${pid:-}" && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

test -x "$binary"
test -x "$node"
command -v setpriv >/dev/null
test -f "$unit"
test -f "$database"
systemctl is-active --quiet "$service"
ss -ltn '( sport = :3398 )' | grep -q LISTEN && {
  echo "Recovery-only loopback port 3398 is already in use." >&2
  exit 1
}

install -d -m 0700 "$restore"
install -m 0755 "$binary" "$backup/bitcoinwalk-relay"
install -m 0600 "$unit" "$backup/bitcoinwalk-relay-production.service"
systemctl cat "$service" >"$backup/service.effective.txt"
systemctl show "$service" \
  -p ActiveState -p SubState -p MainPID -p ExecStart -p Environment \
  >"$backup/service.before.txt"
curl --fail --silent --show-error --max-time 5 \
  -H 'Accept: application/nostr+json' \
  http://127.0.0.1:3340/ >"$backup/live.nip11.json"
curl --fail --silent --show-error --max-time 5 \
  http://127.0.0.1:3340/healthz >"$backup/live.health.before.json"

# The relay stores events in bbolt. Clone the file without stopping production,
# then have the exact installed relay binary open and logically digest the
# read-only snapshot. A torn or corrupt image fails before recovery starts.
cp --reflink=auto --preserve=mode,timestamps "$database" "$backup/events.db"
chmod 0400 "$backup/events.db"
RELAY_REPLICA_DB_DIGEST="$backup/events.db" \
  "$backup/bitcoinwalk-relay" >"$backup/database.digest.before.txt"
grep -Eq '^[0-9a-f]{64}$' "$backup/database.digest.before.txt"

install -m 0600 "$backup/events.db" "$restore/events.db"
install -m 0755 "$backup/bitcoinwalk-relay" "$restore/bitcoinwalk-relay"
chown -R bitcoinwalk:bitcoinwalk "$restore"
# Allow the isolated non-root process to traverse its root-owned evidence
# parent. Evidence files remain unreadable; only the owned restore directory
# can be entered by bitcoinwalk.
chmod 0711 "$backup"
sha256sum \
  "$backup/bitcoinwalk-relay" \
  "$backup/bitcoinwalk-relay-production.service" \
  "$backup/events.db" >"$backup/SHA256SUMS"
(cd "$restore" && sha256sum -c "$backup/SHA256SUMS" 2>/dev/null) || {
  exit 1
}
cmp -s "$backup/bitcoinwalk-relay" "$restore/bitcoinwalk-relay"
cmp -s "$backup/events.db" "$restore/events.db"

setpriv --reuid=bitcoinwalk --regid=bitcoinwalk --init-groups env \
  RELAY_LISTEN="$listen" \
  RELAY_DB="$restore/events.db" \
  RELAY_ORGANIZER_MODE=true \
  'RELAY_NAME=BitcoinWalk isolated production recovery relay' \
  'RELAY_DESCRIPTION=Recovery rehearsal; loopback only.' \
  'RELAY_LANDING_TEXT=Isolated recovery rehearsal.' \
  "$restore/bitcoinwalk-relay" >"$backup/recovered.log" 2>&1 &
pid=$!

ready=false
for _ in $(seq 1 30); do
  if curl --fail --silent --max-time 2 \
    http://127.0.0.1:3398/healthz >"$backup/recovered.health.json"; then
    ready=true
    break
  fi
  sleep 1
done
test "$ready" = true

curl --fail --silent --show-error --max-time 5 \
  -H 'Accept: application/nostr+json' \
  http://127.0.0.1:3398/ >"$backup/recovered.nip11.json"

# Compare every event ID returned by the live and recovered relays. The query
# is read-only, bounded by EOSE and never publishes an event.
"$node" -e '
  const {createHash}=require("node:crypto");
  async function read(url){
    return await new Promise((resolve,reject)=>{
      const ids=new Set(),ws=new WebSocket(url),timer=setTimeout(()=>reject(new Error(`timeout: ${url}`)),15000);
      ws.addEventListener("open",()=>ws.send(JSON.stringify(["REQ","recovery-audit",{}])));
      ws.addEventListener("message",message=>{
        const value=JSON.parse(String(message.data));
        if(value[0]==="EVENT"&&value[2]?.id) ids.add(value[2].id);
        if(value[0]==="EOSE"){
          ws.send(JSON.stringify(["CLOSE","recovery-audit"])); ws.close(); clearTimeout(timer);
          const sorted=[...ids].sort();
          resolve({count:sorted.length,digest:createHash("sha256").update(sorted.join("\n")).digest("hex"),ids:sorted});
        }
      });
      ws.addEventListener("error",()=>reject(new Error(`websocket error: ${url}`)));
    });
  }
  Promise.all([read("ws://127.0.0.1:3340"),read("ws://127.0.0.1:3398")]).then(([live,recovered])=>{
    if(live.count!==recovered.count||live.digest!==recovered.digest) throw new Error("recovered relay event set differs");
    console.log(JSON.stringify({live:{count:live.count,digest:live.digest},recovered:{count:recovered.count,digest:recovered.digest}},null,2));
  }).catch(error=>{console.error(error.message);process.exit(1)});
' >"$backup/event-set.json"

kill "$pid"
wait "$pid" 2>/dev/null || true
pid=

chmod 0400 "$restore/events.db"
RELAY_REPLICA_DB_DIGEST="$restore/events.db" \
  "$restore/bitcoinwalk-relay" >"$backup/database.digest.after.txt"
cmp -s "$backup/database.digest.before.txt" "$backup/database.digest.after.txt"

systemctl is-active --quiet "$service"
curl --fail --silent --show-error --max-time 5 \
  http://127.0.0.1:3340/healthz >"$backup/live.health.after.json"
cmp -s "$backup/live.health.before.json" "$backup/live.health.after.json"

duration=$(( $(date +%s) - started_at ))
printf '{"status":"accepted","durationSeconds":%d,"liveService":"active","isolatedListen":"%s"}\n' \
  "$duration" "$listen" >"$backup/result.json"
find "$backup" -type f ! -name FINAL-SHA256SUMS -print0 | sort -z | xargs -0 sha256sum \
  >"$backup/FINAL-SHA256SUMS"
# The traversal permission was needed only while the isolated non-root relay
# ran. Return the complete retained evidence and restored copy to root-only.
chown -R root:root "$restore"
chmod 0700 "$restore" "$backup"

echo "Isolated production relay recovery rehearsal accepted. Evidence: $backup"
echo "The consistent relay database, binary and service contract were restored on $listen in ${duration}s."
echo "The recovered and live relays served the exact same event-ID set; live production remained active and unchanged."
