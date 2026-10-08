#!/usr/bin/env python3
"""Install only the non-root, loopback, credential-free Rustress fixture service."""
import hashlib
import os
from pathlib import Path
import pwd
import re
import secrets
import shutil
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
# Resolve libraries before changing any service state.
dependencies = subprocess.run(["ldd", str(source)], capture_output=True, text=True, check=True)
assert "not found" not in dependencies.stdout + dependencies.stderr, "Incompatible binary"
root = home / "rustress-fixture"
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
token = root / "secrets" / "api-token"
if not token.exists():
    with token.open("x") as output:
        output.write(secrets.token_urlsafe(32))
assert not token.is_symlink() and token.is_file()
assert token.stat().st_uid == os.geteuid() and token.stat().st_mode & 0o077 == 0
unit_dir = home / ".config" / "systemd" / "user"
unit_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
unit_path = unit_dir / "bitcoinwalk-rustress-fixture.service"
assert not unit_path.is_symlink()
if unit_path.exists():
    assert "# BitcoinWalk isolated fixture only" in unit_path.read_text(), "Unmanaged unit exists"
unit = f"""# BitcoinWalk isolated fixture only
[Unit]
Description=BitcoinWalk Rustress isolated fixture API (NO PAYMENTS)
StartLimitIntervalSec=60
StartLimitBurst=3

[Service]
Type=simple
WorkingDirectory={root / 'state'}
ExecStart=/usr/bin/env -i BITCOINWALK_PROVISIONING_ISOLATED=1 BW_PROVISION_DOMAIN=bitcoinwalk.org BW_PROVISION_REVISION={expected} BW_PROVISION_TOKEN_FILE={token} BW_PROVISION_TEST_DB={root / 'state' / 'isolated.fixture.sqlite'} BW_PROVISION_PORT=8890 BW_PROVISION_WALLET_REFS=isolated-test {binary}
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
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
subprocess.run(["systemctl", "--user", "enable", "bitcoinwalk-rustress-fixture.service"], check=True)
subprocess.run(["systemctl", "--user", "restart", "bitcoinwalk-rustress-fixture.service"], check=True)
print("Installed isolated fixture service; live Rustress and wallet configuration untouched.")
