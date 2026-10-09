#!/usr/bin/env python3
import json,os,stat,sys,tempfile,urllib.request
from pathlib import Path

if os.geteuid()==0 or len(sys.argv)!=3: raise SystemExit(1)
token_path=Path(sys.argv[1]).resolve(strict=True);output=Path(sys.argv[2])
details=token_path.stat()
if not stat.S_ISREG(details.st_mode) or details.st_uid!=os.geteuid() or stat.S_IMODE(details.st_mode)!=0o600 or details.st_nlink!=1: raise SystemExit(1)
token=token_path.read_text().strip()
request=urllib.request.Request("http://127.0.0.1:8894/v1/journal/status",headers={"Authorization":f"Bearer {token}"})
with urllib.request.urlopen(request,timeout=5) as response:
 data=json.load(response)
if not isinstance(data,dict) or set(data)<{"serviceId","binding"}: raise SystemExit(1)
service_id=data["serviceId"];binding=data["binding"]
if not isinstance(service_id,str) or not isinstance(binding,str) or len(binding)!=64 or any(c not in "0123456789abcdef" for c in binding): raise SystemExit(1)
output.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
fd,name=tempfile.mkstemp(prefix=f".{output.name}.",dir=output.parent)
try:
 os.fchmod(fd,0o600)
 with os.fdopen(fd,"w") as handle: json.dump({"serviceId":service_id,"binding":binding},handle,separators=(",",":"));handle.write("\n")
 os.replace(name,output)
finally:
 if os.path.exists(name): os.unlink(name)
