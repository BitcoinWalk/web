#!/usr/bin/env python3
"""Dedicated fixture-only transport. No wallet configuration or operator token."""
import os
from pathlib import Path
import pwd
import re
import subprocess
import sys

assert os.getuid() != 0 and pwd.getpwuid(os.getuid()).pw_name == 'bitcoinwalk'
os.umask(0o077)
home = Path('/home/bitcoinwalk')
root = home / '.config/bitcoinwalk-journal-tunnel'
mode = sys.argv[1]
if mode in ('key', 'install'):
    assert not root.is_symlink()
    root.mkdir(mode=0o700, exist_ok=True)
    assert root.stat().st_mode & 0o777 == 0o700
    key = root / 'id_ed25519'
    assert not key.is_symlink()
    if mode == 'key':
        if not key.exists():
            subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-C', 'bitcoinwalk-journal-fixture-only', '-f', str(key)], check=True)
        print(key.with_suffix('.pub').read_text().strip())
    else:
        hostkey = sys.argv[2]
        assert re.fullmatch(r'ssh-ed25519 [A-Za-z0-9+/=]+', hostkey)
        known = root / 'known_hosts'
        assert not known.exists() and not known.is_symlink()
        known.write_text('213.232.235.240 ' + hostkey + '\n')
        unit = home / '.config/systemd/user/bitcoinwalk-journal-tunnel.service'
        assert not unit.exists() and not unit.is_symlink()
        unit.write_text(f'''[Unit]
Description=BitcoinWalk isolated journal transport (no wallet)
[Service]
ExecStart=/usr/bin/ssh -N -T -F /dev/null -i {key} -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile={known} -o ExitOnForwardFailure=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -L 127.0.0.1:18891:127.0.0.1:8891 bitcoinwalk@213.232.235.240
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
UMask=0077
LimitCORE=0
[Install]
WantedBy=default.target
''')
        os.environ['XDG_RUNTIME_DIR'] = f'/run/user/{os.getuid()}'
        os.environ['DBUS_SESSION_BUS_ADDRESS'] = f'unix:path=/run/user/{os.getuid()}/bus'
        subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
        subprocess.run(['systemctl', '--user', 'start', unit.name], check=True)
        print('Journal-only transport started, not enabled at boot.')
elif mode == 'authorize':
    public = sys.argv[2]
    assert re.fullmatch(r'ssh-ed25519 [A-Za-z0-9+/=]+ bitcoinwalk-journal-fixture-only', public)
    keys = home / '.ssh/authorized_keys'
    assert keys.is_file() and not keys.is_symlink()
    old = keys.read_text()
    # Remote listeners are also confined to the already occupied fixture port;
    # no broad reverse forwarding, shell, PTY, agent, X11 or user-rc access.
    line = 'from="213.232.235.138",restrict,port-forwarding,permitopen="127.0.0.1:8891",permitlisten="127.0.0.1:8891",command="/bin/false" ' + public
    if public.split()[1] not in old:
        with (home / '.ssh/authorized_keys.before-journal-fixture').open('x') as f:
            f.write(old)
        with keys.open('a') as f:
            f.write(('' if old.endswith('\n') else '\n') + line + '\n')
    else:
        assert line in old.splitlines()
    print('Journal-only key authorized; existing access preserved.')
else:
    raise ValueError('Expected key, authorize or install')
