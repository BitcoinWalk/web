#!/bin/sh
# Enable only Islamabad's disabled Rustress reservation on staging. Runs as bitcoinwalk.
set -eu

test "$(id -un)" = bitcoinwalk
release=/opt/bitcoinwalk-app-staging/releases/0.3.243-5b029a612f82
current=$(readlink -f /opt/bitcoinwalk-app-staging/current)
test "$current" = "$release"

city=5c1c04f5-aead-4265-bce7-0f9ce0d9b5cd
dropins=/home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service.d
target=$dropins/zz-islamabad-managed-reservation.conf
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
Environment=BITCOINWALK_RUSTRESS_MANAGED_REVISION=68fdd3cfd2c034678d8907db9c4f855d209fee4f24099b8c96842608b062decb
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
  if curl -fsS --max-time 2 http://127.0.0.1:3338/api/healthz | grep -Fq 'app-staging-0.3.243'; then break; fi
  i=$((i+1)); sleep 1
done
test "$i" -lt 30
test "$(systemctl --user is-active bitcoinwalk-app-staging.service)" = active
effective=$(systemctl --user show bitcoinwalk-app-staging.service -p Environment --value)
printf '%s\n' "$effective" | tr ' ' '\n' | grep '^BITCOINWALK_RUSTRESS_\(MANAGED_CITIES\|MANAGED_MADEIRA_PILOT\|ACTIVATION_ENABLED\|NIP05_ENABLED\|LNURL_ENABLED\)=' || true
case "$effective" in *"BITCOINWALK_RUSTRESS_MANAGED_CITIES=$city"*) ;; *) echo "Islamabad allow-list was not applied." >&2; false;; esac
case "$effective" in *"BITCOINWALK_RUSTRESS_ACTIVATION_ENABLED=0"*) ;; *) echo "Activation gate is not closed." >&2; false;; esac
case "$effective" in *"BITCOINWALK_RUSTRESS_NIP05_ENABLED=0"*) ;; *) echo "NIP-05 gate is not closed." >&2; false;; esac
case "$effective" in *"BITCOINWALK_RUSTRESS_LNURL_ENABLED=0"*) ;; *) echo "LNURL gate is not closed." >&2; false;; esac

# Reservation reconciliation is deliberately asynchronous and cannot activate
# NIP-05, Lightning metadata or invoice issuance under the flags above.
sleep 75
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
if(row.phase!=="verified")throw new Error("Islamabad reservation is not yet verified.");
console.log(`Islamabad disabled reservation: ${row.phase}.`);
NODE

trap - EXIT HUP INT TERM
echo "Islamabad staging reservation enabled with every public capability closed. Evidence: $backup"
