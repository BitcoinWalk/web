#!/usr/bin/env python3
"""Read-only transport acceptance; never enables the app pilot."""
import json
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request

root=Path("/home/bitcoinwalk/.config/bitcoinwalk-rustress-tunnel")
token=(root/"api-token").read_text().strip()
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
url="http://127.0.0.1:18890/v1/bitcoinwalk/capabilities"
for attempt in range(20):
    try:
        with opener.open(urllib.request.Request(url,headers={"Authorization":"Bearer "+token}),timeout=5) as response:
            data=json.load(response)
        break
    except urllib.error.URLError:
        if attempt==19:raise
        time.sleep(0.5)
assert data["api"]=="bitcoinwalk-provisioning-v1"
assert data["adapterRevision"]=="796b10d033024b33d0899bc8499f9ab5a7c113a68efcc5c8718c5c38797c41d7"
assert data["invoiceIssuanceGate"] is True
try:
    opener.open(url,timeout=5)
    raise AssertionError("Unauthenticated access allowed")
except urllib.error.HTTPError as error:
    assert error.code==401
    error.close()
base=["ssh","-T","-F","/dev/null","-i",str(root/"id_ed25519"),"-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","StrictHostKeyChecking=yes","-o",f"UserKnownHostsFile={root/'known_hosts'}","-o","ConnectTimeout=5"]
host="bitcoinwalk@213.232.235.240"
for args in [[host,"true"],["-W","127.0.0.1:8889",host],["-N","-o","ExitOnForwardFailure=yes","-R","127.0.0.1:18891:127.0.0.1:8890",host]]:
    result=subprocess.run(base+args,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=12)
    assert result.returncode != 0,"Fixture key allowed an out-of-scope action"
print("PASS: pinned fixture capabilities, private authentication, no shell, no live Rustress-port access, no unrelated reverse listener.")
