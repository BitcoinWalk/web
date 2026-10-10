#!/usr/bin/env python3
"""Register the exact applied Madeira v2 config with the local payout service."""
import json
import os
import pathlib
import pwd
import sqlite3
import stat
import urllib.request

CITY="ca20993a-5b7f-443e-931e-8dbaa61d05fe"
DB=pathlib.Path("/home/bitcoinwalk/rustress-managed/state/bitcoinwalk.managed.sqlite")
TOKEN=pathlib.Path("/home/bitcoinwalk/.local/state/bitcoinwalk-rustress/secrets/authority-api-token")

def protected(path:pathlib.Path,mode:int=0o600):
    value=path.lstat()
    if not stat.S_ISREG(value.st_mode) or value.st_nlink!=1 or stat.S_IMODE(value.st_mode)!=mode or value.st_uid!=os.getuid():
        raise SystemExit("Payout authority registration refused: protected input is invalid")

if os.geteuid()==0 or pwd.getpwuid(os.geteuid()).pw_name!="bitcoinwalk":
    raise SystemExit("Payout authority registration refused: use the non-root bitcoinwalk account")
protected(DB);protected(TOKEN)
credential=TOKEN.read_text(encoding="ascii").strip()
if not 43<=len(credential)<=256 or not credential.replace("_","").replace("-","").isalnum():
    raise SystemExit("Payout authority registration refused: invalid API credential")
db=sqlite3.connect(f"file:{DB}?mode=ro",uri=True)
try:
    rows=db.execute("SELECT config FROM bw_configs WHERE city_id=? AND version=2 AND state='applied'",(CITY,)).fetchall()
finally:
    db.close()
if len(rows)!=1:
    raise SystemExit("Payout authority registration refused: exact applied Madeira v2 config not found")
config=json.loads(rows[0][0])
if config.get("cityId")!=CITY or config.get("version")!=2 or config.get("localPart")!="madeira" or config.get("domain")!="bitcoinwalk.org" or config.get("walletRef")!="bitcoinwalk-rustress" or config.get("payoutVersion")!=1 or config.get("invoiceIssuance")!="enabled" or config.get("organizerBasisPoints")!=7900 or config.get("retainedBasisPoints")!=2100:
    raise SystemExit("Payout authority registration refused: Madeira configuration does not match the approved policy")
request=urllib.request.Request("http://127.0.0.1:8893/v1/authority",data=json.dumps(config,separators=(",",":")).encode(),method="POST",headers={"Authorization":"Bearer "+credential,"Content-Type":"application/json"})
try:
    with urllib.request.urlopen(request,timeout=10) as response:
        result=json.load(response)
except Exception as error:
    raise SystemExit("Payout authority registration refused: service did not confirm the record") from error
if result.get("api")!="bitcoinwalk-payout-authority-v1" or result.get("state")!="recorded" or result.get("cityId")!=CITY or result.get("payoutVersion")!=1:
    raise SystemExit("Payout authority registration refused: confirmation mismatch")
print("MADEIRA_PAYOUT_AUTHORITY_RECORDED payoutVersion=1")
