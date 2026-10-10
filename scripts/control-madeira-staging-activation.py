#!/usr/bin/env python3
"""Bounded, non-root Madeira public gateway window. Never configures a wallet."""
from __future__ import annotations
import json, os, pathlib, sqlite3, subprocess, sys, tempfile, time, urllib.request, urllib.error

HOME=pathlib.Path("/home/bitcoinwalk")
DROPIN_DIR=HOME/".config/systemd/user/bitcoinwalk-app-staging.service.d"
# This must sort after the persistent 98/99 Madeira configuration.  The old
# 110-prefixed name sorted *before* 98 and 99 lexicographically, allowing the
# reservation mode to overwrite activation-v1.
DROPIN=DROPIN_DIR/"zz-madeira-public-activation-window.conf"
LEGACY_DROPIN=DROPIN_DIR/"110-madeira-public-activation-window.conf"
DB=pathlib.Path("/var/lib/bitcoinwalk-app-staging/payments.sqlite")
UNIT="bitcoinwalk-app-staging.service"
TIMER="bitcoinwalk-madeira-public-window-expiry"
SCRIPT=HOME/".local/libexec/bitcoinwalk-madeira-public-window/control.py"
CITY="ca20993a-5b7f-443e-931e-8dbaa61d05fe"

def fail(message:str):
    print(f"Madeira public activation refused: {message}",file=sys.stderr);raise SystemExit(1)
def run(*args:str,check=True):
    return subprocess.run(args,check=check,text=True,capture_output=True)
def http(path:str):
    try:
        with urllib.request.urlopen("http://127.0.0.1:3338"+path,timeout=10) as response:return response.status,response.read().decode()
    except urllib.error.HTTPError as error:return error.code,error.read().decode()
    except urllib.error.URLError:return 0,""
def restart():
    run("systemctl","--user","daemon-reload");run("systemctl","--user","restart",UNIT)
    for _ in range(30):
        status,body=http("/api/healthz")
        try:
            if status==200 and json.loads(body).get("release")=="app-staging-0.3.211":return
        except json.JSONDecodeError:pass
        time.sleep(.5)
    fail("staging app health check failed")
def exact_consent():
    if not DB.is_file() or DB.is_symlink():fail("private staging database unavailable")
    with sqlite3.connect(f"file:{DB}?mode=ro",uri=True) as db:
        row=db.execute("SELECT challenge,owner,admin FROM madeira_managed_activation WHERE singleton=1").fetchone()
    if not row or not row[1] or not row[2]:fail("both Madeira activation signatures are required")
    value=json.loads(row[0]);active=value.get("activation",{});reserved=value.get("reserved",{})
    expected=value.get("scope")=="madeira-managed-public-activation-v1" and value.get("cityId")==CITY and value.get("publicOrigin")=="https://bitcoinwalk.org" and value.get("nip05")=="madeira@bitcoinwalk.org" and value.get("lightningAddress")=="madeira@bitcoinwalk.org" and value.get("organizerBasisPoints")==7900 and value.get("retainedBasisPoints")==2100 and reserved.get("invoiceIssuance")=="disabled" and active.get("invoiceIssuance")=="enabled" and active.get("version")==reserved.get("version",0)+1
    if not expected:fail("saved activation consent does not match the bounded Madeira pilot")
def pause(expired=False):
    DROPIN.unlink(missing_ok=True);LEGACY_DROPIN.unlink(missing_ok=True);restart()
    nip=http("/.well-known/nostr.json?name=madeira");lnurl=http("/.well-known/lnurlp/madeira")
    if nip[0]!=200 or json.loads(nip[1])!={"names":{}} or lnurl[0]!=404:fail("public gateway did not close")
    if not expired:
        run("systemctl","--user","stop",TIMER+".timer",TIMER+".service",check=False)
        run("systemctl","--user","reset-failed",TIMER+".timer",TIMER+".service",check=False)
        run("systemctl","--user","daemon-reload")
    print("MADEIRA_PUBLIC_WINDOW_PAUSED")
def activate(seconds:int,nip05_only=False):
    if seconds<60 or seconds>900:fail("window must be between 60 and 900 seconds")
    exact_consent()
    run("systemctl","--user","stop",TIMER+".timer",TIMER+".service",check=False)
    run("systemctl","--user","reset-failed",TIMER+".timer",TIMER+".service",check=False)
    run("systemctl","--user","daemon-reload")
    DROPIN.parent.mkdir(parents=True,exist_ok=True)
    content="[Service]\nEnvironment=BITCOINWALK_RUSTRESS_MANAGED_MADEIRA_PILOT=activation-v1\nEnvironment=BITCOINWALK_RUSTRESS_NIP05_ENABLED=1\n"
    if not nip05_only:content+="Environment=BITCOINWALK_RUSTRESS_ACTIVATION_ENABLED=1\nEnvironment=BITCOINWALK_RUSTRESS_LNURL_ENABLED=1\n"
    fd,name=tempfile.mkstemp(prefix=".madeira-window.",dir=DROPIN.parent,text=True)
    try:
        os.fchmod(fd,0o600);os.write(fd,content.encode());os.fsync(fd);os.close(fd);os.replace(name,DROPIN)
        restart()
        result=run("systemd-run","--user","--quiet","--unit",TIMER,"--on-active",f"{seconds}s",str(SCRIPT),"pause","--expired",check=False)
        timer=run("systemctl","--user","is-active",TIMER+".timer",check=False)
        if result.returncode or timer.stdout.strip()!="active":raise RuntimeError()
    except Exception:
        pathlib.Path(name).unlink(missing_ok=True);DROPIN.unlink(missing_ok=True);LEGACY_DROPIN.unlink(missing_ok=True);restart();fail("automatic closure could not be scheduled")
    capability="nip05-only" if nip05_only else "nip05-and-lnurl"
    print(f"MADEIRA_PUBLIC_WINDOW_ACTIVE capability={capability} seconds={seconds}")
def main():
    if os.geteuid()==0 or os.environ.get("USER")!="bitcoinwalk":fail("non-root bitcoinwalk user required")
    if len(sys.argv)>=2 and sys.argv[1]=="activate":activate(int(sys.argv[2]));return
    if len(sys.argv)>=2 and sys.argv[1]=="activate-nip05":activate(int(sys.argv[2]),True);return
    if len(sys.argv)>=2 and sys.argv[1]=="pause":pause("--expired" in sys.argv[2:]);return
    fail("use activate <seconds>, activate-nip05 <seconds> or pause")
if __name__=="__main__":main()
