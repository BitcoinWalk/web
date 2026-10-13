#!/usr/bin/env bash
set -euo pipefail

started="$(date +%s)"
app_root=/home/bitcoinwalk/apps/bitcoinwalk-production
config_root=/home/bitcoinwalk/.config/bitcoinwalk
state_root=/home/bitcoinwalk/.local/state/bitcoinwalk-production
share_root=/home/bitcoinwalk/.local/share/bitcoinwalk-production
release="$(readlink -f "$app_root/current")"
runtime="$app_root/runtime"
live_release="$(sed -nE 's/^BITCOINWALK_APP_RELEASE=(app-production-[0-9]+\.[0-9]+\.[0-9]+)$/\1/p' "$config_root/production-release.env")"
test -n "$live_release"
recovery_release="app-production-recovery-${live_release#app-production-}"
database="$state_root/payments.sqlite"
evidence="$(mktemp -d /home/bitcoinwalk/backups/bitcoinwalk-production-recovery-rehearsal.XXXXXX)"
chmod 0700 "$evidence"
restore="$evidence/restore"
mkdir -m 0700 "$restore"

test -x "$runtime/bin/node"
test -f "$release/server.js"
test -f "$database"
test -d "$share_root/media"
test -d "$share_root/city-logos"
! ss -ltn 'sport = :3399' | grep -q LISTEN

tar -czf "$evidence/app-release.tar.gz" -C "$release" .
tar -czf "$evidence/node-runtime.tar.gz" -C "$runtime" .
tar -czf "$evidence/config.tar.gz" -C "$config_root" app.env production.env production-release.env
cp -a /home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-production.service "$evidence/"

cd "$release"
"$runtime/bin/node" -e '
 const {DatabaseSync,backup}=require("node:sqlite"),source=new DatabaseSync(process.argv[1],{readOnly:true});
 backup(source,process.argv[2]).then(()=>source.close()).catch(error=>{console.error(error.message);process.exit(1)});
' "$database" "$evidence/payments.sqlite"

mkdir -m 0700 "$evidence/assets"
cp -a "$share_root/media" "$evidence/assets/media"
cp -a "$share_root/city-logos" "$evidence/assets/city-logos"
tar -czf "$evidence/assets.tar.gz" -C "$evidence/assets" media city-logos
rm -rf "$evidence/assets"

cd "$evidence"
sha256sum app-release.tar.gz node-runtime.tar.gz config.tar.gz payments.sqlite assets.tar.gz bitcoinwalk-app-production.service >SHA256SUMS
sha256sum -c SHA256SUMS

mkdir -m 0700 "$restore/app" "$restore/runtime" "$restore/config" "$restore/share"
tar -xzf app-release.tar.gz -C "$restore/app"
tar -xzf node-runtime.tar.gz -C "$restore/runtime"
tar -xzf config.tar.gz -C "$restore/config"
tar -xzf assets.tar.gz -C "$restore/share"
cp -a payments.sqlite "$restore/payments.sqlite"

manifest(){
  local root="$1" output="$2"
  (cd "$root" && find media city-logos -type f -print0 | sort -z | xargs -0 -r sha256sum) >"$output"
}
mkdir -m 0700 "$evidence/reference-assets"
tar -xzf assets.tar.gz -C "$evidence/reference-assets"
manifest "$evidence/reference-assets" "$evidence/assets.reference.sha256"
manifest "$restore/share" "$evidence/assets.restored.sha256"
cmp "$evidence/assets.reference.sha256" "$evidence/assets.restored.sha256"
rm -rf "$evidence/reference-assets"

database_report(){
  local path="$1" output="$2"
  "$restore/runtime/bin/node" -e '
   const {DatabaseSync}=require("node:sqlite"),db=new DatabaseSync(process.argv[1],{readOnly:true});
   const integrity=db.prepare("PRAGMA integrity_check").get().integrity_check,userVersion=db.prepare("PRAGMA user_version").get().user_version;
   const tables=db.prepare("SELECT name FROM sqlite_master WHERE type=? AND name NOT LIKE ? ORDER BY name").all("table","sqlite_%").map(row=>({name:row.name,count:db.prepare(`SELECT count(*) AS count FROM \"${row.name.replaceAll(`\"`,`\"\"`)}\"`).get().count}));
   console.log(JSON.stringify({integrity,userVersion,tables},null,2));db.close();
  ' "$path" >"$output"
  grep -q '"integrity": "ok"' "$output"
}
database_report "$restore/payments.sqlite" "$evidence/database.before.json"

set -a
. "$restore/config/app.env"
. "$restore/config/production.env"
. "$restore/config/production-release.env"
set +a
export NODE_ENV=production HOSTNAME=127.0.0.1 PORT=3399 NEXT_TELEMETRY_DISABLED=1
export BITCOINWALK_APP_RELEASE="$recovery_release"
export BITCOINWALK_PAYMENT_DATABASE="$restore/payments.sqlite"
export BITCOINWALK_MEDIA_ROOT="$restore/share/media"
export BITCOINWALK_CITY_LOGO_DIR="$restore/share/city-logos"
cd "$restore/app"
"$restore/runtime/bin/node" server.js >"$evidence/recovered-app.log" 2>&1 &
pid=$!
cleanup(){ kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; }
trap cleanup EXIT
for _ in $(seq 1 30); do
  if curl -fsS --max-time 3 http://127.0.0.1:3399/api/healthz >"$evidence/recovered-health.json"; then break; fi
  sleep 1
done
grep -Fq "\"release\":\"$recovery_release\"" "$evidence/recovered-health.json"
curl -fsS --max-time 10 http://127.0.0.1:3399/ >/dev/null
cleanup
trap - EXIT
database_report "$restore/payments.sqlite" "$evidence/database.after.json"
cmp "$evidence/database.before.json" "$evidence/database.after.json"

systemctl --user is-active bitcoinwalk-app-production.service >"$evidence/live-service.txt"
test "$(cat "$evidence/live-service.txt")" = active
curl -fsS --max-time 15 https://bitcoinwalk.org/api/healthz >"$evidence/live-health.json"
grep -Fq "\"release\":\"$live_release\"" "$evidence/live-health.json"

elapsed="$(( $(date +%s)-started ))"
printf '%s\n' "$elapsed" >"$evidence/recovery-seconds.txt"
(cd "$evidence" && find . -type f ! -name EVIDENCE-SHA256SUMS -printf '%P\0' | sort -z | xargs -0 -r sha256sum) >"$evidence/EVIDENCE-SHA256SUMS"
chmod -R go-rwx "$evidence"

echo "Isolated production application recovery rehearsal accepted for $live_release. Evidence: $evidence"
echo "The current release, owner-only configuration, consistent SQLite backup, media and city-logo assets restored and verified in isolation in ${elapsed}s."
echo "The recovered app passed loopback health without changing its database; the live production service remained active and healthy."
