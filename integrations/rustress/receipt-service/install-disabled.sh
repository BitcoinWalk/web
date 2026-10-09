#!/bin/sh
set -eu
service=bitcoinwalk-rustress-receipt;version=0.1.0;worker_image="$service-worker:$version";signer_image="$service-signer:$version"
root="$HOME/.local/state/bitcoinwalk-rustress/receipt-service";worker="$root/worker";signer="$root/signer";socket="$root/socket";mode="$root/receipt-mode"
fail(){ printf '%s\n' "Receipt service installation failed." >&2;exit 1; }
[ "$(id -u)" -ne 0 ]&&[ "$(id -un)" = bitcoinwalk ]||fail
docker info --format '{{json .SecurityOptions}}'|grep -q '"name=rootless"'||fail
[ -f SHA256SUMS ]&&[ ! -L SHA256SUMS ]||fail;sha256sum -c SHA256SUMS
mkdir -p "$root";chmod 700 "$root";[ -d "$root" ]&&[ ! -L "$root" ]&&[ "$(stat -c '%U:%G:%a' "$root")" = bitcoinwalk:bitcoinwalk:700 ]||fail
for path in "$worker" "$signer" "$socket";do mkdir -p "$path";chmod 700 "$path";[ -d "$path" ]&&[ ! -L "$path" ]&&[ "$(stat -c '%U:%G:%a' "$path")" = bitcoinwalk:bitcoinwalk:700 ]||fail;done
if [ ! -e "$mode" ];then umask 077;printf '%s\n' disabled>"$mode";fi
[ -f "$mode" ]&&[ ! -L "$mode" ]&&[ "$(stat -c '%U:%G:%a' "$mode")" = bitcoinwalk:bitcoinwalk:600 ]&&[ "$(tr -d '\n'<"$mode")" = disabled ]||fail
docker container inspect "$service-signer" >/dev/null 2>&1&&fail
docker build --pull=false --network=none -f Dockerfile.worker --label "org.bitcoinwalk.version=$version" -t "$worker_image" . >/dev/null
docker build --pull=false --network=none -f Dockerfile.signer --label "org.bitcoinwalk.version=$version" -t "$signer_image" . >/dev/null
if docker container inspect "$service-worker" >/dev/null 2>&1;then [ "$(docker container inspect "$service-worker" --format '{{index .Config.Labels "org.bitcoinwalk.service"}}')" = rustress-receipt-worker ]||fail;fi
old="";if docker container inspect "$service-worker" >/dev/null 2>&1;then old="$service-worker-rollback-$(date -u +%Y%m%dT%H%M%SZ)";docker stop "$service-worker" >/dev/null;docker rename "$service-worker" "$old";fi
rollback(){ docker rm -f "$service-worker" >/dev/null 2>&1||true;if [ -n "$old" ];then docker rename "$old" "$service-worker";docker start "$service-worker" >/dev/null;fi;fail; }
docker run -d --name "$service-worker" --restart unless-stopped --network none --label org.bitcoinwalk.service=rustress-receipt-worker --label org.bitcoinwalk.mode=disabled --label "org.bitcoinwalk.version=$version" --user 0:0 --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 48 --memory 192m --cpus 0.25 --mount "type=bind,src=$mode,dst=/run/bitcoinwalk-receipt-worker/config/receipt-mode,readonly" --mount "type=bind,src=$worker,dst=/var/lib/bitcoinwalk-receipt-worker" --env NODE_ENV=production "$worker_image" >/dev/null||rollback
ready=0;i=0;while [ "$i" -lt 20 ];do if docker exec "$service-worker" node /app/verify-rustress-receipt-worker.cjs disabled >/dev/null 2>&1;then ready=1;break;fi;i=$((i+1));sleep 2;done
[ "$ready" -eq 1 ]||rollback
[ "$(docker container inspect "$service-worker" --format '{{.HostConfig.NetworkMode}}|{{.HostConfig.ReadonlyRootfs}}|{{.HostConfig.Privileged}}|{{json .HostConfig.CapDrop}}|{{json .HostConfig.SecurityOpt}}|{{.HostConfig.RestartPolicy.Name}}')" = 'none|true|false|["ALL"]|["no-new-privileges:true"]|unless-stopped' ]||rollback
[ "$(docker container inspect "$service-worker" --format '{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{index .Config.Labels "org.bitcoinwalk.version"}}')" = "disabled|$version" ]||rollback
[ "$(docker exec "$service-worker" awk '/^Uid:/{print $2":"$3":"$4":"$5} /^CapEff:/{print $2}' /proc/1/status)" = '0:0:0:0
0000000000000000' ]||rollback
if [ -n "$old" ];then docker rm "$old" >/dev/null;fi
printf '%s\n' "Receipt worker $version is installed disabled and network-isolated. Signer image built but not started."
