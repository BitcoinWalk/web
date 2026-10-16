#!/usr/bin/env python3
import hashlib
import json
import os
import pwd
import re
import sqlite3
import time
import urllib.request
from pathlib import Path

assert os.geteuid() != 0 and pwd.getpwuid(os.geteuid()).pw_name == "bitcoinwalk"
home = Path("/home/bitcoinwalk")
managed_db = home / "rustress-managed/state/bitcoinwalk.managed.sqlite"
ledger_db = home / ".local/state/bitcoinwalk-rustress/payout-service/ledger.sqlite"
provision_path = home / "rustress-managed/secrets/provision-api-token"
authority_path = home / ".local/state/bitcoinwalk-rustress/secrets/authority-api-token"
for path in (managed_db, ledger_db, provision_path, authority_path):
    assert path.is_file() and not path.is_symlink()

backup = home / ".local/state/bitcoinwalk-rustress/backups" / ("guide-provider-address-" + time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()))
backup.mkdir(mode=0o700, parents=True)
for source, name in ((managed_db, "managed.sqlite"), (ledger_db, "ledger.sqlite")):
    with sqlite3.connect(source) as origin, sqlite3.connect(backup / name) as target:
        origin.backup(target)

provision = provision_path.read_text().strip()
authority = authority_path.read_text().strip()
assert re.fullmatch(r"[A-Za-z0-9_-]{43,256}", provision)
assert re.fullmatch(r"[A-Za-z0-9_-]{43,256}", authority)

def request(port, path, token=None, method="GET", body=None):
    data = None if body is None else json.dumps(body, separators=(",", ":")).encode()
    headers = {"Host": "bitcoinwalk.org", "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as response:
        return response.status, json.load(response)

config = {"version": 1, "domain": "bitcoinwalk.org", "localPart": "guide", "walletRef": "bitcoinwalk-rustress", "receivingDestination": "bitcoinwalk@getalby.com", "invoiceIssuance": "enabled"}
digest = hashlib.sha256(json.dumps(config, separators=(",", ":")).encode()).hexdigest()
command = {"api": "bitcoinwalk-provisioning-v1", "expectedVersion": 0, "idempotencyKey": f"address:guide:1:{digest}", "config": config}
status, retained = request(8893, "/v1/retained-address-authority", authority, "POST", config)
assert status == 200 and retained["state"] == "recorded" and retained["localPart"] == "guide"
status, prepared = request(8895, "/v1/bitcoinwalk/addresses/guide/prepare", provision, "POST", command)
assert status == 200 and prepared["state"] in ("prepared", "applied")
status, applied = request(8895, "/v1/bitcoinwalk/addresses/guide/apply", provision, "POST", command)
assert status == 200 and applied["state"] == "applied"
status, receipt = request(8895, "/v1/bitcoinwalk/addresses/guide", provision)
assert status == 200 and receipt["configHash"] == digest and receipt["invoiceIssuance"] == "enabled"
status, metadata = request(8895, "/.well-known/lnurlp/guide")
assert status == 200 and metadata["callback"] == "https://bitcoinwalk.org/lnurlp/guide/callback"
status, invoice = request(8895, "/lnurlp/guide/callback?amount=1000")
assert status == 200 and str(invoice["pr"]).startswith("lnbc")
print(f"GUIDE_PROVIDER_ADDRESS_OK evidence={backup}")
