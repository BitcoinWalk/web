#!/usr/bin/env python3
import hashlib,json,os,pwd,re,urllib.request
from pathlib import Path
assert os.geteuid()!=0 and pwd.getpwuid(os.geteuid()).pw_name=="bitcoinwalk"
token=Path("/home/bitcoinwalk/rustress-managed/secrets/provision-api-token").read_text().strip();assert re.fullmatch(r"[A-Za-z0-9_-]{43,256}",token)
authority=Path("/home/bitcoinwalk/.local/state/bitcoinwalk-rustress/secrets/authority-api-token").read_text().strip();assert re.fullmatch(r"[A-Za-z0-9_-]{43,256}",authority)
def request(path,method="GET",body=None,auth=True):
 data=None if body is None else json.dumps(body,separators=(",",":"),ensure_ascii=False).encode();headers={"Host":"bitcoinwalk.org","Content-Type":"application/json"};
 if auth:headers["Authorization"]="Bearer "+token
 req=urllib.request.Request("http://127.0.0.1:8895"+path,data=data,method=method,headers=headers)
 with urllib.request.urlopen(req,timeout=20) as response:return response.status,json.load(response)
def retain(body):
 req=urllib.request.Request("http://127.0.0.1:8893/v1/retained-address-authority",data=json.dumps(body,separators=(",",":")).encode(),method="POST",headers={"Authorization":"Bearer "+authority,"Content-Type":"application/json"})
 with urllib.request.urlopen(req,timeout=20) as response:return response.status,json.load(response)
for name in ("endo","donate"):
 config={"version":2,"domain":"bitcoinwalk.org","localPart":name,"walletRef":"bitcoinwalk-rustress","receivingDestination":"bitcoinwalk@getalby.com","invoiceIssuance":"enabled"};digest=hashlib.sha256(json.dumps(config,separators=(",",":"),ensure_ascii=False).encode()).hexdigest();command={"api":"bitcoinwalk-provisioning-v1","expectedVersion":1,"idempotencyKey":f"address:{name}:2:{digest}","config":config}
 assert retain(config)[1]["state"]=="recorded"
 assert request(f"/v1/bitcoinwalk/addresses/{name}/prepare","POST",command)[1]["state"] in ("prepared","applied");assert request(f"/v1/bitcoinwalk/addresses/{name}/apply","POST",command)[1]["state"]=="applied";receipt=request(f"/v1/bitcoinwalk/addresses/{name}")[1];assert receipt["configHash"]==digest and receipt["invoiceIssuance"]=="enabled"
 status,metadata=request(f"/.well-known/lnurlp/{name}",auth=False);assert status==200 and metadata["tag"]=="payRequest" and metadata["callback"]==f"https://bitcoinwalk.org/lnurlp/{name}/callback"
 status,invoice=request(f"/lnurlp/{name}/callback?amount=1000",auth=False);assert status==200 and str(invoice["pr"]).startswith("lnbc") and invoice["routes"]==[] and f"/lnurlp/{name}/verify/" in invoice["verify"]
print("RUSTRESS_STANDALONE_ADDRESSES_ENABLED_UNPAID_INVOICES_OK")
