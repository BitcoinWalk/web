#!/usr/bin/env python3
import hashlib,json,os,pwd,re,shutil,sqlite3,subprocess,time,urllib.request,urllib.error
from pathlib import Path
assert os.geteuid()!=0 and pwd.getpwuid(os.geteuid()).pw_name=="bitcoinwalk"
home=Path("/home/bitcoinwalk");old="2011e8ccdaef6e0278d5bc3329456cbd572323dd5c7ed918eb8504c1e2afad93";new="68fdd3cfd2c034678d8907db9c4f855d209fee4f24099b8c96842608b062decb"
source=home/"incoming/rustress-standalone-addresses-0.1.3";unit=home/".config/systemd/user/bitcoinwalk-rustress-managed.service";db=home/"rustress-managed/state/bitcoinwalk.managed.sqlite";token_path=home/"rustress-managed/secrets/provision-api-token"
assert source.is_file() and not source.is_symlink() and hashlib.sha256(source.read_bytes()).hexdigest()==new
text=unit.read_text();assert old in text and new not in text;assert "BW_ORGANIZATION_DESTINATION=" not in text
candidate=text.replace(old,new).replace("BW_PROVISION_WALLET_REFS=bitcoinwalk-rustress /home/","BW_PROVISION_WALLET_REFS=bitcoinwalk-rustress BW_ORGANIZATION_DESTINATION=bitcoinwalk@getalby.com /home/")
assert new in candidate and old not in candidate and "BW_ORGANIZATION_DESTINATION=bitcoinwalk@getalby.com" in candidate
backup_root=home/".local/state/bitcoinwalk-rustress/backups";backup_root.mkdir(mode=0o700,parents=True,exist_ok=True);backup=backup_root/("rustress-standalone-addresses-"+time.strftime("%Y%m%dT%H%M%SZ",time.gmtime()));backup.mkdir(mode=0o700)
release=home/"rustress-managed/releases"/new;release.mkdir(mode=0o700,exist_ok=True);target=release/"rustress"
if target.exists():assert not target.is_symlink() and hashlib.sha256(target.read_bytes()).hexdigest()==new
else:shutil.copy2(source,target);target.chmod(0o700)
def restore():
 subprocess.run(["systemctl","--user","stop","bitcoinwalk-rustress-managed.service"],check=False);shutil.copy2(backup/"service.before",unit);shutil.copy2(backup/"database.before",db);subprocess.run(["systemctl","--user","daemon-reload"],check=False);subprocess.run(["systemctl","--user","start","bitcoinwalk-rustress-managed.service"],check=False)
try:
 subprocess.run(["systemctl","--user","stop","bitcoinwalk-rustress-managed.service"],check=True);shutil.copy2(unit,backup/"service.before");shutil.copy2(db,backup/"database.before")
 unit.write_text(candidate);subprocess.run(["systemctl","--user","daemon-reload"],check=True);subprocess.run(["systemctl","--user","start","bitcoinwalk-rustress-managed.service"],check=True)
 token=token_path.read_text().strip();assert re.fullmatch(r"[A-Za-z0-9_-]{43,256}",token)
 def request(path,method="GET",body=None):
  data=None if body is None else json.dumps(body,separators=(",",":"),ensure_ascii=False).encode();req=urllib.request.Request("http://127.0.0.1:8895"+path,data=data,method=method,headers={"Host":"bitcoinwalk.org","Authorization":"Bearer "+token,"Content-Type":"application/json"});
  with urllib.request.urlopen(req,timeout=10) as response:return response.status,json.load(response)
 ready=False
 for _ in range(30):
  try:
   status,cap=request("/v1/bitcoinwalk/capabilities");ready=status==200 and cap.get("adapterRevision")==new and cap.get("standaloneNoSplitAddresses") is True
   if ready:break
  except Exception:time.sleep(1)
 assert ready
 for name in ("endo","donate"):
  config={"version":1,"domain":"bitcoinwalk.org","localPart":name,"walletRef":"bitcoinwalk-rustress","receivingDestination":"bitcoinwalk@getalby.com","invoiceIssuance":"disabled"};digest=hashlib.sha256(json.dumps(config,separators=(",",":"),ensure_ascii=False).encode()).hexdigest();command={"api":"bitcoinwalk-provisioning-v1","expectedVersion":0,"idempotencyKey":f"address:{name}:1:{digest}","config":config}
  assert request(f"/v1/bitcoinwalk/addresses/{name}/prepare","POST",command)[1]["state"]=="prepared";assert request(f"/v1/bitcoinwalk/addresses/{name}/apply","POST",command)[1]["state"]=="applied";receipt=request(f"/v1/bitcoinwalk/addresses/{name}")[1];assert receipt["configHash"]==digest and receipt["invoiceIssuance"]=="disabled"
 with sqlite3.connect(f"file:{db}?mode=ro",uri=True) as connection:
  assert connection.execute("PRAGMA integrity_check").fetchone()==("ok",)
  for name in ("endo","donate"):
   row=connection.execute("SELECT users.id,is_prism,nostr_pubkey,nwc_uri FROM bw_address_claims JOIN users ON users.id=bw_address_claims.user_id WHERE bw_address_claims.local_part=?",(name,)).fetchone();assert row and row[1:]==(0,None,None);assert connection.execute("SELECT COUNT(*) FROM prism_splits WHERE user_id=?",(row[0],)).fetchone()==(0,)
except Exception:
 restore();raise
print(f"RUSTRESS_STANDALONE_ADDRESSES_DISABLED_OK evidence={backup}")
