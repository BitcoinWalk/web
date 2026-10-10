#!/usr/bin/env python3
"""Register only the independently applied Islamabad pilot payout version."""
import json
import os
import pathlib
import pwd
import sqlite3
import stat
import urllib.request

if os.geteuid() == 0 or pwd.getpwuid(os.geteuid()).pw_name != "bitcoinwalk":
    raise SystemExit("Use the non-root bitcoinwalk account.")
city = "5c1c04f5-aead-4265-bce7-0f9ce0d9b5cd"
database = pathlib.Path("/home/bitcoinwalk/rustress-managed/state/bitcoinwalk.managed.sqlite")
token = pathlib.Path("/home/bitcoinwalk/.local/state/bitcoinwalk-rustress/secrets/authority-api-token")
for path in [database, token]:
    value = path.lstat()
    if not stat.S_ISREG(value.st_mode) or value.st_nlink != 1 or stat.S_IMODE(value.st_mode) != 0o600 or value.st_uid != os.getuid():
        raise SystemExit("Protected authority input required.")
db = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
rows = db.execute("SELECT config FROM bw_configs WHERE city_id=? AND version=2 AND state='applied'", (city,)).fetchall()
db.close()
if len(rows) != 1:
    raise SystemExit("Exact applied Islamabad activation required.")
config = json.loads(rows[0][0])
expected = {"cityId": city, "version": 2, "domain": "bitcoinwalk.org", "localPart": "islamabad", "payoutVersion": 3,
    "brandPubkey": "81311f94b68d6b2cc0e43fee4a853d53b4ba5c4071f236833a9cb92dcaf3824b",
    "brandEventId": "b377a42fbb4c597c0c3af9f49cd5b8b0301184a79d5a88255555bd5056518f19",
    "walletRef": "bitcoinwalk-rustress", "organizerBasisPoints": 7900, "retainedBasisPoints": 2100, "invoiceIssuance": "enabled"}
if any(config.get(key) != value for key, value in expected.items()):
    raise SystemExit("Applied configuration differs from reviewed Islamabad policy.")
request = urllib.request.Request("http://127.0.0.1:8893/v1/authority", data=json.dumps(config, separators=(",", ":")).encode(),
    method="POST", headers={"Authorization": "Bearer " + token.read_text().strip(), "Content-Type": "application/json"})
try:
    with urllib.request.urlopen(request, timeout=10) as response:
        result = json.load(response)
except Exception:
    raise SystemExit("Payout service did not confirm authority.")
if result.get("api") != "bitcoinwalk-payout-authority-v1" or result.get("state") != "recorded" or result.get("cityId") != city or result.get("payoutVersion") != 3:
    raise SystemExit("Payout authority read-back mismatch.")
print("ISLAMABAD_PAYOUT_AUTHORITY_RECORDED payoutVersion=3")
