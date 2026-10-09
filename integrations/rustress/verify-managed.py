#!/usr/bin/env python3
"""Verify the empty managed candidate without revealing credentials."""
import hashlib
import http.client
import json
import os
from pathlib import Path
import pwd
import re
import socket
import sqlite3
import subprocess
import sys

assert os.geteuid() != 0 and pwd.getpwuid(os.geteuid()).pw_name == "bitcoinwalk"
expected = sys.argv[1]
assert re.fullmatch(r"[0-9a-f]{64}", expected)
home = Path("/home/bitcoinwalk")
root = home / "rustress-managed"
binary = root / "releases" / expected / "rustress"
assert hashlib.sha256(binary.read_bytes()).hexdigest() == expected
token_path = root / "secrets/provision-api-token"
issuer_path = home / ".local/state/bitcoinwalk-rustress/secrets/issuer-api-token"
for path in [token_path, issuer_path]:
    result = path.lstat()
    assert path.is_file() and not path.is_symlink() and result.st_uid == os.geteuid()
    assert result.st_mode & 0o077 == 0 and result.st_nlink == 1
token = token_path.read_text().strip()
assert re.fullmatch(r"[A-Za-z0-9_-]{43,256}", token)

def request(path: str, authorized: bool = False):
    connection = http.client.HTTPConnection("127.0.0.1", 8895, timeout=5)
    headers = {"Host": "bitcoinwalk.org"}
    if authorized:
        headers["Authorization"] = "Bearer " + token
    connection.request("GET", path, headers=headers)
    response = connection.getresponse()
    body = response.read(16_385)
    connection.close()
    assert len(body) <= 16_384
    return response.status, json.loads(body)

status, capabilities = request("/v1/bitcoinwalk/capabilities", True)
assert status == 200 and capabilities["adapterRevision"] == expected
assert request("/v1/bitcoinwalk/capabilities")[0] == 401
status, identity = request("/.well-known/nostr.json?name=not-configured")
assert status == 200 and identity == {"names": {}}
assert request("/.well-known/lnurlp/not-configured")[0] == 404
database = root / "state/bitcoinwalk.managed.sqlite"
with sqlite3.connect(f"file:{database}?mode=ro", uri=True) as connection:
    assert connection.execute("PRAGMA integrity_check").fetchone() == ("ok",)
    assert connection.execute("SELECT id FROM bw_managed_marker").fetchone() == (1,)
    assert connection.execute("SELECT COUNT(*) FROM bw_claims").fetchone() == (0,)
    assert connection.execute("SELECT COUNT(*) FROM users WHERE nwc_uri IS NOT NULL").fetchone() == (0,)
pid = int(subprocess.check_output(["systemctl", "--user", "show", "--property=MainPID", "--value", "bitcoinwalk-rustress-managed.service"], text=True))
assert pid > 1 and Path(f"/proc/{pid}/status").read_text().split("Uid:\t", 1)[1].splitlines()[0].split()[0] == str(os.geteuid())
with socket.create_connection(("127.0.0.1", 8895), timeout=5):
    pass
container = subprocess.check_output(["docker", "inspect", "bitcoinwalk-rustress-payout", "--format", "{{index .Config.Labels \"org.bitcoinwalk.version\"}}|{{index .Config.Labels \"org.bitcoinwalk.mode\"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}"], text=True).strip()
assert container == "0.2.2|disabled|none|running"
assert not (home / ".local/state/bitcoinwalk-rustress/payout-config/activation.json").exists()
print("RUSTRESS_MANAGED_DISABLED_CANDIDATE_OK")
