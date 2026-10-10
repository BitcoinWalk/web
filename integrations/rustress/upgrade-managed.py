#!/usr/bin/env python3
"""Upgrade the live non-root managed Rustress adapter with rollback."""
import hashlib
import http.client
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time

assert os.geteuid()!=0 and pwd.getpwuid(os.geteuid()).pw_name=="bitcoinwalk", "Run as bitcoinwalk, never root"
os.umask(0o077);home=Path("/home/bitcoinwalk");assert Path.home()==home
expected=sys.argv[1];assert re.fullmatch(r"[0-9a-f]{64}",expected)
source=Path(__file__).resolve().parent/"rustress";assert source.is_file() and not source.is_symlink() and hashlib.sha256(source.read_bytes()).hexdigest()==expected
root=home/"rustress-managed";unit=home/".config/systemd/user/bitcoinwalk-rustress-managed.service";db=root/"state/bitcoinwalk.managed.sqlite"
provision=root/"secrets/provision-api-token";issuer=home/".local/state/bitcoinwalk-rustress/secrets/issuer-api-token";authority=home/".local/state/bitcoinwalk-rustress/secrets/authority-api-token"
for path in [unit,db,provision,issuer,authority]:
 result=path.lstat();assert path.is_file() and not path.is_symlink() and result.st_uid==os.geteuid() and result.st_nlink==1
 if path in [provision,issuer,authority]:assert result.st_mode&0o077==0 and result.st_size<=1024
old_unit=unit.read_text();assert "# BitcoinWalk managed candidate" in old_unit
with sqlite3.connect(f"file:{db}?mode=ro",uri=True) as connection:
 assert connection.execute("PRAGMA integrity_check").fetchone()==("ok",);before=connection.execute("SELECT city_id,version,hash,state FROM bw_configs ORDER BY city_id,version").fetchall()
release=root/"releases"/expected;release.mkdir(mode=0o700,parents=True,exist_ok=True);target=release/"rustress"
if not target.exists():shutil.copyfile(source,target);target.chmod(0o700)
assert hashlib.sha256(target.read_bytes()).hexdigest()==expected
candidate=re.sub(r"BW_PROVISION_REVISION=[0-9a-f]{64}",f"BW_PROVISION_REVISION={expected}",old_unit)
candidate=re.sub(r"(/home/bitcoinwalk/rustress-managed/releases/)[0-9a-f]{64}/rustress",rf"\g<1>{expected}/rustress",candidate)
if "BW_PAYOUT_AUTHORITY_TOKEN_FILE=" not in candidate:candidate=candidate.replace(f"BW_INVOICE_ISSUER_TOKEN_FILE={issuer} ",f"BW_INVOICE_ISSUER_TOKEN_FILE={issuer} BW_PAYOUT_AUTHORITY_TOKEN_FILE={authority} ")
assert candidate!=old_unit and f"BW_PROVISION_REVISION={expected}" in candidate and f"BW_PAYOUT_AUTHORITY_TOKEN_FILE={authority}" in candidate and str(target) in candidate
backup=Path(tempfile.mkdtemp(prefix="rustress-managed-payout-update-",dir=home/"backups"));shutil.copy2(unit,backup/"service.before");shutil.copy2(db,backup/"database.before")
def rollback():
 subprocess.run(["systemctl","--user","stop",unit.name],check=False);shutil.copy2(backup/"service.before",unit);shutil.copy2(backup/"database.before",db);subprocess.run(["systemctl","--user","daemon-reload"],check=False);subprocess.run(["systemctl","--user","start",unit.name],check=False)
try:
 subprocess.run(["systemctl","--user","stop",unit.name],check=True);unit.write_text(candidate);subprocess.run(["systemctl","--user","daemon-reload"],check=True);subprocess.run(["systemctl","--user","start",unit.name],check=True)
 token=provision.read_text().strip();assert re.fullmatch(r"[A-Za-z0-9_-]{43,256}",token)
 capabilities=None
 for attempt in range(20):
  connection=http.client.HTTPConnection("127.0.0.1",8895,timeout=5)
  try:
   connection.request("GET","/v1/bitcoinwalk/capabilities",headers={"Host":"bitcoinwalk.org","Authorization":"Bearer "+token,"Accept":"application/json"});response=connection.getresponse();body=response.read(16385)
   if response.status==200 and len(body)<=16384:capabilities=json.loads(body);break
  except OSError:
   pass
  finally:connection.close()
  time.sleep(1)
 assert capabilities and capabilities.get("adapterRevision")==expected
 with sqlite3.connect(f"file:{db}?mode=ro",uri=True) as connection:
  assert connection.execute("PRAGMA integrity_check").fetchone()==("ok",);after=connection.execute("SELECT city_id,version,hash,state FROM bw_configs ORDER BY city_id,version").fetchall()
 assert after==before and subprocess.run(["systemctl","--user","is-active","--quiet",unit.name]).returncode==0
except Exception:
 rollback();raise
print(f"Managed Rustress payout-update adapter is active. Backup: {backup}")
