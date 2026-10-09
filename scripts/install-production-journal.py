#!/usr/bin/env python3
"""One-time paused production journal installation for the app VPS."""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tarfile

if os.getuid() == 0 or Path.home() != Path('/home/bitcoinwalk'):
    sys.exit('Expected non-root bitcoinwalk account')
os.umask(0o077)
base = Path.home() / 'journal-production-0.1.0'
if base.exists():
    sys.exit('Production journal directory already exists; refusing overwrite')
archive = Path(sys.argv[1]).resolve()
expected = sys.argv[2]
binding = sys.stdin.read(128).strip()
if not re.fullmatch(r'[0-9a-f]{64}', binding):
    sys.exit('Invalid wallet binding')
if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
    sys.exit('Package checksum mismatch')
node = Path('/opt/bitcoinwalk-app-staging/runtime/bin/node')
version = subprocess.run([node, '--version'], check=True, capture_output=True, text=True).stdout.strip()
if not version.startswith('v24.'):
    sys.exit('Node 24 runtime required')
base.mkdir(mode=0o700)
with tarfile.open(archive) as tar:
    tar.extractall(base, filter='data')
state = base / 'state'
state.mkdir(mode=0o700)
(state / 'config.json').write_text(json.dumps({'binding': binding, 'port': 8894}))
for name in ['client.token', 'operator.token']:
    (state / name).write_text(secrets.token_urlsafe(48))
for child in state.iterdir():
    child.chmod(0o600)
unit = Path.home() / '.config/systemd/user/bitcoinwalk-payout-journal.service'
if unit.exists():
    sys.exit('Unit already exists; refusing overwrite')
unit.write_text(f'''[Unit]
Description=BitcoinWalk production payout journal (paused by default)
[Service]
Type=simple
ExecStart={node} {base}/bitcoinwalk-remote-journal-0.1.0/journal.cjs {state}
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths={state}
LimitCORE=0
Restart=on-failure
RestartSec=5
TimeoutStopSec=15
[Install]
WantedBy=default.target
''')
os.environ['XDG_RUNTIME_DIR'] = f'/run/user/{os.getuid()}'
os.environ['DBUS_SESSION_BUS_ADDRESS'] = f'unix:path=/run/user/{os.getuid()}/bus'
subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
subprocess.run(['systemctl', '--user', 'start', unit.name], check=True)
print('Production payout journal started paused; it is not enabled at boot.')
