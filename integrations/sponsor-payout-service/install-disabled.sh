#!/usr/bin/env sh
set -eu
service=bitcoinwalk-sponsor-payout;version=0.1.0;image="$service:$version"
root="$HOME/.local/state/bitcoinwalk-sponsor-payout";state="$root/state";mode="$root/mode";bin="$HOME/.local/libexec/bitcoinwalk-sponsor-payout";units="$HOME/.config/systemd/user"
fail(){ printf '%s\n' 'Sponsor payout disabled installation failed.' >&2;exit 1; }
[ "$(id -u)" -ne 0 ] || fail;[ "$(id -un)" = bitcoinwalk ] || fail
docker info --format '{{json .SecurityOptions}}' | grep -q '"name=rootless"' || fail
[ -f SHA256SUMS ] && [ ! -L SHA256SUMS ] || fail;sha256sum -c SHA256SUMS
mkdir -p "$state" "$bin" "$units";chmod 700 "$root" "$state" "$bin"
[ ! -L "$root" ] && [ ! -L "$state" ] && [ ! -L "$bin" ] || fail
if [ ! -e "$mode" ];then umask 077;printf 'disabled\n' > "$mode";fi
[ -f "$mode" ] && [ ! -L "$mode" ] && [ "$(cat "$mode")" = disabled ] || fail;chmod 600 "$mode"
docker build --pull=false --network=none --label "org.bitcoinwalk.version=$version" -t "$image" . >/dev/null
old="";if docker container inspect "$service" >/dev/null 2>&1;then old="$service-rollback-$(date -u +%Y%m%dT%H%M%SZ)";docker stop "$service" >/dev/null;docker rename "$service" "$old";fi
rollback(){ code=$?;trap - EXIT HUP INT TERM;docker rm -f "$service" >/dev/null 2>&1||true;if [ -n "$old" ];then docker rename "$old" "$service";docker start "$service" >/dev/null;fi;exit "$code";};trap rollback EXIT HUP INT TERM
docker run -d --name "$service" --restart unless-stopped --network none --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m \
 --label org.bitcoinwalk.service=sponsor-payout --label org.bitcoinwalk.mode=disabled --label "org.bitcoinwalk.version=$version" \
 --user 0:0 --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 64 --memory 128m --cpus 0.20 \
 --mount "type=bind,src=$state,dst=/var/lib/bitcoinwalk-sponsor-payout" --mount "type=bind,src=$mode,dst=/run/bitcoinwalk-config/sponsor-payout-mode,readonly" \
 --env NODE_ENV=production "$image" >/dev/null
i=0;until docker exec "$service" node /app/verify-sponsor-payout-service.cjs >/dev/null 2>&1;do i=$((i+1));[ "$i" -lt 20 ]||fail;sleep 1;done
[ "$(docker inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.HostConfig.ReadonlyRootfs}}|{{.HostConfig.Privileged}}|{{json .HostConfig.CapDrop}}|{{.State.Status}}')" = "$version|disabled|none|true|false|[\"ALL\"]|running" ] || fail
install -m 700 backup-state.sh monitor-disabled.sh "$bin/";install -m 644 bitcoinwalk-sponsor-payout-backup.service bitcoinwalk-sponsor-payout-backup.timer bitcoinwalk-sponsor-payout-monitor.service bitcoinwalk-sponsor-payout-monitor.timer "$units/"
systemctl --user daemon-reload;systemctl --user enable --now bitcoinwalk-sponsor-payout-backup.timer bitcoinwalk-sponsor-payout-monitor.timer >/dev/null
"$bin/backup-state.sh" >/dev/null;"$bin/monitor-disabled.sh" >/dev/null
if [ -n "$old" ];then docker rm "$old" >/dev/null;fi
trap - EXIT HUP INT TERM
printf 'Sponsor payout service %s installed safely disabled. No credential loaded and no funds moved.\n' "$version"
