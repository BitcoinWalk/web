#!/bin/sh
set -eu

test "$(id -u)" -eq 0 || { echo "Run as root." >&2; exit 1; }
release_dir=${1:-}
test -n "$release_dir" && test -d "$release_dir" || { echo "Usage: $0 RELEASE_DIRECTORY" >&2; exit 1; }
worker="$release_dir/guide.cjs"
knowledge="$release_dir/knowledge.json"
check="$release_dir/check-guide-ai-drafting-disabled.cjs"
target=/opt/bitcoinwalk-guide/guide.cjs
knowledge_target=/opt/bitcoinwalk-guide/knowledge-bw152.json
unit=bitcoinwalk-guide.service
expected_old=a78cc3370453ec8e400e7aa745f0ec9ae79e5f57f61d60c11fc082dbe28b1622
expected_worker=49b07fc9e8f9b4016b5fde6679d4a12b55d7321a2f03199a8984680c09270422
expected_knowledge=29af47d88ed208412668d20c16c6021bb7eb1661ba72a7ea94c04ab1fa460229
expected_check=ab00fe7ffd0dcdbeccc3f5fea42d93c4cc2aa91b8c7196023a72fcc7100954ed

for file in "$worker" "$knowledge" "$check";do test -f "$file" && test ! -L "$file" || { echo "Release artifact is missing or unsafe: $file" >&2; exit 1; };done
test -f "$target" && test ! -L "$target" || { echo "Installed Guide worker is missing or unsafe." >&2; exit 1; }
test "$(sha256sum "$target"|awk '{print $1}')" = "$expected_old" || { echo "Installed Guide worker changed; refusing replacement." >&2; exit 1; }
echo "$expected_worker  $worker"|sha256sum -c -
echo "$expected_knowledge  $knowledge"|sha256sum -c -
echo "$expected_check  $check"|sha256sum -c -
systemctl is-active --quiet "$unit" || { echo "Guide service is not active." >&2; exit 1; }
if systemctl cat "$unit"|grep -Eq 'GUIDE_(AI_MODEL|KNOWLEDGE)|openai-key';then echo "Guide AI configuration already exists; review manually." >&2;exit 1;fi
"$check" "$knowledge"

backup=$(mktemp -d /var/backups/bitcoinwalk-guide-bw152-disabled.XXXXXX)
cp -a "$target" "$backup/guide.cjs"
test ! -e "$knowledge_target" || cp -a "$knowledge_target" "$backup/knowledge-bw152.json"
rollback(){ install -o root -g root -m 0755 "$backup/guide.cjs" "$target";if test -f "$backup/knowledge-bw152.json";then install -o root -g root -m 0644 "$backup/knowledge-bw152.json" "$knowledge_target";else rm -f "$knowledge_target";fi;systemctl restart "$unit"||true; }
trap rollback HUP INT TERM
install -o root -g root -m 0755 "$worker" "$target"
install -o root -g root -m 0644 "$knowledge" "$knowledge_target"
if ! systemctl restart "$unit"||! systemctl is-active --quiet "$unit";then rollback;echo "Guide update failed; previous worker and knowledge restored." >&2;exit 1;fi
sleep 2
systemctl is-active --quiet "$unit"||{ rollback;echo "Guide stopped after restart; previous installation restored." >&2;exit 1; }
if systemctl cat "$unit"|grep -Eq 'GUIDE_(AI_MODEL|KNOWLEDGE)|openai-key';then rollback;echo "Guide AI unexpectedly enabled; previous installation restored." >&2;exit 1;fi
trap - HUP INT TERM
echo "BW-152 Guide drafting installed and verified DISABLED."
echo "No OpenAI credential or model configuration was installed; no model call or message send occurred."
echo "Backup: $backup"
sha256sum "$target" "$knowledge_target"
systemctl status "$unit" --no-pager -n 8
