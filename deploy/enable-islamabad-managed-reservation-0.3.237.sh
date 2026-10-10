#!/bin/sh
# Enable only Islamabad's disabled Rustress reservation on staging. Runs as bitcoinwalk.
set -eu

test "$(id -un)" = bitcoinwalk
release=/opt/bitcoinwalk-app-staging/releases/0.3.237-9b09a156c0e3
current=$(readlink -f /opt/bitcoinwalk-app-staging/current)
test "$current" = "$release"

city=5c1c04f5-aead-4265-bce7-0f9ce0d9b5cd
dropins=/home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service.d
target=$dropins/102-islamabad-managed-reservation.conf
backup=$(mktemp -d /home/bitcoinwalk/backups/islamabad-managed-reservation.XXXXXX)
chmod 0700 "$backup"
test ! -e "$target" || cp -p "$target" "$backup/previous.conf"

rollback(){
  status=$?
  if test "$status" -ne 0; then
    if test -f "$backup/previous.conf"; then cp -p "$backup/previous.conf" "$target"; else rm -f "$target"; fi
    systemctl --user daemon-reload
    systemctl --user restart bitcoinwalk-app-staging.service || true
    echo "Islamabad reservation activation failed; prior configuration restored. Evidence: $backup" >&2
  fi
  exit "$status"
}
trap rollback EXIT HUP INT TERM

mkdir -p "$dropins"
cat >"$target.next" <<EOF
[Service]
Environment=BITCOINWALK_RUSTRESS_MANAGED_CITIES=$city
Environment=BITCOINWALK_RUSTRESS_MANAGED_MADEIRA_PILOT=
Environment=BITCOINWALK_RUSTRESS_ACTIVATION_ENABLED=0
Environment=BITCOINWALK_RUSTRESS_NIP05_ENABLED=0
Environment=BITCOINWALK_RUSTRESS_LNURL_ENABLED=0
EOF
chmod 0600 "$target.next"
mv "$target.next" "$target"
systemctl --user daemon-reload
systemctl --user restart bitcoinwalk-app-staging.service

i=0
while test "$i" -lt 30; do
  if curl -fsS --max-time 2 http://127.0.0.1:3338/api/healthz | grep -Fq 'app-staging-0.3.237'; then break; fi
  i=$((i+1)); sleep 1
done
test "$i" -lt 30
test "$(systemctl --user is-active bitcoinwalk-app-staging.service)" = active

# Reservation reconciliation is deliberately asynchronous and cannot activate
# NIP-05, Lightning metadata or invoice issuance under the flags above.
sleep 35
set -a
. /home/bitcoinwalk/.config/bitcoinwalk/app.env
. /home/bitcoinwalk/.config/bitcoinwalk/staging-payment.env
set +a
/opt/bitcoinwalk-app-staging/runtime/bin/node - <<'NODE'
const {DatabaseSync}=require("node:sqlite");
const city="5c1c04f5-aead-4265-bce7-0f9ce0d9b5cd";
const db=new DatabaseSync(process.env.BITCOINWALK_PAYMENT_DATABASE,{readOnly:true});
const row=db.prepare("SELECT phase,config FROM rustress_managed_reservation_task WHERE city=?").get(city);
db.close();
if(!row)throw new Error("Islamabad reservation task was not created.");
const config=JSON.parse(row.config);
if(config.cityId!==city||config.invoiceIssuance!=="disabled"||config.version!==1)throw new Error("Islamabad reservation is not disabled version 1.");
console.log(`Islamabad disabled reservation: ${row.phase}.`);
NODE

trap - EXIT HUP INT TERM
echo "Islamabad staging reservation enabled with every public capability closed. Evidence: $backup"
