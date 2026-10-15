#!/bin/sh
set -eu
service=bitcoinwalk-rustress-payout
parked="$service-invoice-only-rollback"
root="$HOME/.local/state/bitcoinwalk-rustress"
mode=$(tr -d '\n'<"$root/payout-mode")

verify_operation(){
 attempt=1
 while [ "$attempt" -le 4 ];do
  if docker exec "$service" node -e '
   const fs=require("node:fs");
   const tokenPath="/run/bitcoinwalk-secrets/operations-api-token";
   const stat=fs.lstatSync(tokenPath);
   if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.uid!==0||stat.size<43||stat.size>256)throw new Error();
   const token=fs.readFileSync(tokenPath,"utf8").trim();
   if(!/^[A-Za-z0-9_-]{43,256}$/.test(token))throw new Error();
   const counters=["authorityRecords","pendingIncoming","prepared","unknown","paid","invoiceIssued","invoiceCreatedPendingIntake","invoiceOutcomesUnknown"];
   fetch("http://127.0.0.1:8893/v1/status",{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(5000)}).then(async response=>{
    const body=await response.json(),socket="/run/bitcoinwalk-payout-evidence/socket/evidence.sock",socketStat=fs.lstatSync(socket);
    if(response.status!==200||body.service!=="bitcoinwalk-rustress-payout"||body.mode!=="operation"||body.enabled!==true||body.running!==true||
      typeof body.ready!=="boolean"||!Number.isSafeInteger(body.consecutiveFailures)||body.consecutiveFailures<0||
      counters.some(name=>!Number.isSafeInteger(body[name])||body[name]<0)||body.unknown!==0||body.invoiceOutcomesUnknown!==0||
      !socketStat.isSocket()||socketStat.isSymbolicLink()||(socketStat.mode&0o777)!==0o600||socketStat.uid!==0||fs.realpathSync(socket)!==socket)throw new Error();
   }).catch(()=>{process.exitCode=1;});
  ';then return 0;fi
  [ "$attempt" -lt 4 ]||return 1
  attempt=$((attempt+1));sleep 5
 done
}

case "$mode" in
 invoice-only)
  [ "$(docker inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}')" = '0.2.14|invoice-only|host|running' ]&&
   ! docker container inspect "$parked" >/dev/null 2>&1
 ;;
 operation)
  [ "$(docker inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}')" = '0.2.14|operation|host|running' ]&&
   docker container inspect "$parked" >/dev/null 2>&1&&
   [ "$(systemctl --user is-active bitcoinwalk-payout-operation-expiry.timer)" = active ]&&
   verify_operation
 ;;
 *) exit 1;;
esac
