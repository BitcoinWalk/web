#!/bin/sh
set -eu

test "$(id -u)" -eq 0 || { echo "Run as root." >&2; exit 1; }
config=/etc/bitcoinwalk-guide/config.json
node=/opt/bitcoinwalk-app-staging/runtime/bin/node
test -f "$config" && test ! -L "$config" || { echo "Guide configuration is missing or unsafe." >&2; exit 1; }
test "$(sha256sum /opt/bitcoinwalk-guide/guide.cjs | awk '{print $1}')" = a78cc3370453ec8e400e7aa745f0ec9ae79e5f57f61d60c11fc082dbe28b1622 || { echo "Unexpected Guide worker; refusing preflight." >&2; exit 1; }

"$node" -e '
const fs=require("node:fs"),source=process.argv[1],dir=process.argv[2];
const base=JSON.parse(fs.readFileSync(source,"utf8"));
if(Object.hasOwn(base,"support"))throw new Error("Support configuration already exists; review manually.");
const relays=["wss://auth.nostr1.com/","wss://inbox.nostr.wine/","wss://relay.damus.io/"];
for(const [index,relay] of relays.entries()){
 const config={...base,allowedInboxRelays:[...new Set([...base.allowedInboxRelays,relay])],support:{enabled:true,inboxRelays:[relay],retentionDays:30}};
 fs.writeFileSync(`${dir}/support-relay-${index+1}.json`,JSON.stringify(config,null,2)+"\n",{mode:0o644});
}
' "$config" /etc/bitcoinwalk-guide
chown root:root /etc/bitcoinwalk-guide/support-relay-1.json /etc/bitcoinwalk-guide/support-relay-2.json /etc/bitcoinwalk-guide/support-relay-3.json
chmod 0644 /etc/bitcoinwalk-guide/support-relay-1.json /etc/bitcoinwalk-guide/support-relay-2.json /etc/bitcoinwalk-guide/support-relay-3.json
echo "Prepared three isolated support-relay preflight configurations. Live configuration unchanged."
