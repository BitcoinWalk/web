#!/usr/bin/env python3
"""One-time, non-root fixture installation. Never opens live wallet configuration."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tarfile
import urllib.request

if os.getuid() == 0 or Path.home() != Path('/home/bitcoinwalk'):
    sys.exit('Expected non-root bitcoinwalk account')
os.umask(0o077)
base = Path.home() / 'journal-staging-0.1.0'
if base.exists():
    sys.exit('Staging directory already exists; refusing overwrite')
archive = Path(sys.argv[1]).resolve()
expected = sys.argv[2]
if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
    sys.exit('Package checksum mismatch')
base.mkdir(mode=0o700)
version = 'v24.19.0'
name = f'node-{version}-linux-x64.tar.xz'
url = f'https://nodejs.org/dist/{version}/'
checksums = urllib.request.urlopen(url + 'SHASUMS256.txt', timeout=60).read().decode()
digest = next(line.split()[0] for line in checksums.splitlines() if line.split()[-1] == name)
runtime = base / name
runtime.write_bytes(urllib.request.urlopen(url + name, timeout=120).read())
if hashlib.sha256(runtime.read_bytes()).hexdigest() != digest:
    sys.exit('Node checksum mismatch; installation stopped')
for path in [runtime, archive]:
    with tarfile.open(path) as tar:
        tar.extractall(base, filter='data')
node = base / f'node-{version}-linux-x64/bin/node'
state = base / 'state'
state.mkdir(mode=0o700)
(state / 'config.json').write_text(json.dumps({'binding': hashlib.sha256(b'bitcoinwalk-isolated-journal-staging-no-wallet-v1').hexdigest(), 'port': 8891}))
for name in ['client.token', 'operator.token']:
    (state / name).write_text(secrets.token_urlsafe(32))
unit = Path.home() / '.config/systemd/user/bitcoinwalk-journal-staging.service'
if unit.exists():
    sys.exit('Unit already exists; refusing overwrite')
unit.write_text(f'''[Unit]
Description=BitcoinWalk isolated journal staging (no wallet)
[Service]
Type=simple
ExecStart={node} {base}/bitcoinwalk-remote-journal-0.1.0/journal.cjs {state}
UMask=0077
NoNewPrivileges=true
LimitCORE=0
Restart=no
TimeoutStopSec=15
[Install]
WantedBy=default.target
''')
os.environ['XDG_RUNTIME_DIR'] = f'/run/user/{os.getuid()}'
os.environ['DBUS_SESSION_BUS_ADDRESS'] = f'unix:path=/run/user/{os.getuid()}/bus'
subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
# Deliberately not enabled at boot and never activated for sending.
subprocess.run(['systemctl', '--user', 'start', unit.name], check=True)
print('Isolated journal staging service started; no wallet; not enabled at boot.')
