#!/usr/bin/env python3
"""Remote acceptance: fixed fixture city, no public payments or live DB access."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request

assert os.geteuid() != 0
root = Path("/home/bitcoinwalk/rustress-fixture")
revision = sys.argv[1]
token = (root / "secrets" / "api-token").read_text().strip()
origin = "http://127.0.0.1:8890"
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
def request(path, body=None, authenticated=True):
    headers = {"Authorization": "Bearer " + token} if authenticated else {}
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(origin + path, data=None if body is None else json.dumps(body).encode(), headers=headers)
    try:
        with opener.open(req, timeout=10) as response:
            return response.status, json.loads(response.read(16385))
    except urllib.error.HTTPError as error:
        error.close()
        return error.code, None

def ready():
    for _ in range(50):
        try:
            status, info = request("/v1/bitcoinwalk/capabilities")
            if status == 200:
                assert info["adapterRevision"] == revision
                assert info["upstreamCommit"] == "c72fdeccd80025d181efc1b1d45baeb8bfbde4a9"
                assert info["domain"] == "bitcoinwalk.org"
                return
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(0.2)
    raise RuntimeError("Fixture service not ready")

ready()
assert request("/v1/bitcoinwalk/capabilities", authenticated=False)[0] == 401
for path in ["/admin", "/.well-known/nostr.json?name=fixture-city", "/.well-known/lnurlp/fixture-city", "/lnurlp/fixture-city/callback?amount=1000"]:
    assert request(path)[0] == 404
config = dict(cityId="00000000-0000-4000-8000-000000000001", version=1,
    domain="bitcoinwalk.org", localPart="fixture-city", brandPubkey="a"*64,
    authorityEventId="b"*64, approvalEventId="c"*64, brandEventId="d"*64,
    payoutVersion=1, payoutDestination="fixture@example.org", walletRef="isolated-test",
    organizerBasisPoints=7900, retainedBasisPoints=2100, invoiceIssuance="disabled")
digest = hashlib.sha256(json.dumps(config, separators=(",", ":")).encode()).hexdigest()
command = dict(api="bitcoinwalk-provisioning-v1", expectedVersion=0,
    idempotencyKey=f"{config['cityId']}:1:{digest}", config=config)
path = "/v1/bitcoinwalk/cities/" + config["cityId"]
assert request(path + "/prepare", command)[0] == 200
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results = list(pool.map(lambda _: request(path + "/apply", command), range(2)))
assert results[0] == results[1] and results[0][0] == 200
assert results[0][1]["state"] == "applied"
assert results[0][1]["configHash"] == digest
assert results[0][1]["invoiceIssuance"] == "disabled"
assert request(path + "/prepare", command)[1]["state"] == "applied"
before = request(path)
subprocess.run(["systemctl", "--user", "restart", "bitcoinwalk-rustress-fixture.service"], check=True)
ready()
assert request(path) == before
assert request(path + "/apply", command) == before
with sqlite3.connect(f"file:{root / 'state' / 'isolated.fixture.sqlite'}?mode=ro", uri=True) as db:
    assert db.execute("SELECT count(*) FROM users").fetchone()[0] == 1
    assert db.execute("SELECT count(*) FROM prism_splits").fetchone()[0] == 1
    assert db.execute("SELECT count(*) FROM users WHERE nwc_uri IS NOT NULL").fetchone()[0] == 0
    assert db.execute("SELECT percentage FROM prism_splits").fetchone()[0] == 79
    assert db.execute("SELECT count(*) FROM bw_configs").fetchone()[0] == 1
service = subprocess.check_output(["systemctl", "--user", "show", "bitcoinwalk-rustress-fixture.service", "--property=MainPID", "--value"], text=True).strip()
assert int(service) > 0
assert Path("/proc", service).stat().st_uid == os.geteuid()
listeners = subprocess.check_output(["ss", "-ltn"], text=True).splitlines()
port_lines = [line for line in listeners if ":8890 " in line]
assert len(port_lines) == 1 and "127.0.0.1:8890 " in port_lines[0]
print("PASS: artifact pin, private authentication, denied public routes, atomic apply, concurrent/exact retries, restart read-back, one user/one split, NULL wallet credentials, non-root PID and loopback-only listener.")
