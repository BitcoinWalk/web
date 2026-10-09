#!/usr/bin/env python3
"""Install the non-root managed Rustress candidate on loopback only."""
import hashlib
import os
from pathlib import Path
import pwd
import re
import secrets
import shutil
import socket
import subprocess
import sys

assert os.geteuid() != 0, "Never run as root"
assert pwd.getpwuid(os.geteuid()).pw_name == "bitcoinwalk"
home = Path("/home/bitcoinwalk")
assert Path.home() == home
os.umask(0o077)
expected = sys.argv[1]
assert re.fullmatch(r"[0-9a-f]{64}", expected), "Expected artifact SHA-256 required"
source = Path(__file__).resolve().parent / "rustress"
assert source.is_file() and not source.is_symlink()
assert hashlib.sha256(source.read_bytes()).hexdigest() == expected, "Artifact mismatch"
dependencies = subprocess.run(["ldd", str(source)], capture_output=True, text=True, check=True)
assert "not found" not in dependencies.stdout + dependencies.stderr, "Incompatible binary"
with socket.socket() as check:
    assert check.connect_ex(("127.0.0.1", 8895)) != 0, "Managed port already in use"

root = home / "rustress-managed"
for directory in [root, root / "releases", root / "state", root / "secrets", root / "releases" / expected]:
    assert not directory.is_symlink(), "Refuse symlinked service paths"
    directory.mkdir(mode=0o700, exist_ok=True)
    assert directory.stat().st_uid == os.geteuid()
    directory.chmod(0o700)
binary = root / "releases" / expected / "rustress"
if binary.exists():
    assert not binary.is_symlink() and hashlib.sha256(binary.read_bytes()).hexdigest() == expected
else:
    shutil.copyfile(source, binary)
    binary.chmod(0o700)
provision = root / "secrets" / "provision-api-token"
if not provision.exists():
    with provision.open("x") as output:
        output.write(secrets.token_urlsafe(48) + "\n")
issuer = home / ".local/state/bitcoinwalk-rustress/secrets/issuer-api-token"
for token in [provision, issuer]:
    result = token.lstat()
    assert token.is_file() and not token.is_symlink() and result.st_uid == os.geteuid()
    assert result.st_mode & 0o077 == 0 and result.st_nlink == 1

unit_dir = home / ".config/systemd/user"
unit_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
unit_path = unit_dir / "bitcoinwalk-rustress-managed.service"
assert not unit_path.is_symlink()
if unit_path.exists():
    assert "# BitcoinWalk managed candidate" in unit_path.read_text(), "Unmanaged unit exists"
unit = f"""# BitcoinWalk managed candidate
[Unit]
Description=BitcoinWalk managed Rustress candidate
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=3

[Service]
Type=simple
WorkingDirectory={root / 'state'}
ExecStart=/usr/bin/env -i BITCOINWALK_MANAGED=1 BW_PROVISION_DOMAIN=bitcoinwalk.org BW_PROVISION_REVISION={expected} BW_PROVISION_TOKEN_FILE={provision} BW_INVOICE_ISSUER_TOKEN_FILE={issuer} BW_MANAGED_DB={root / 'state' / 'bitcoinwalk.managed.sqlite'} BW_PROVISION_PORT=8895 BW_PROVISION_WALLET_REFS=bitcoinwalk-rustress {binary}
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths={root / 'state'}
RestrictAddressFamilies=AF_INET AF_UNIX
MemoryMax=256M
TasksMax=64
CPUQuota=25%
LimitNOFILE=1024

[Install]
WantedBy=default.target
"""
unit_path.write_text(unit)
subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
subprocess.run(["systemctl", "--user", "enable", unit_path.name], check=True)
subprocess.run(["systemctl", "--user", "restart", unit_path.name], check=True)
print("Installed managed Rustress candidate on loopback; no city configured or payment activated.")
