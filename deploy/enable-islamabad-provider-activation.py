#!/usr/bin/env python3
"""Enable only the verified Islamabad provider transition, not public routing."""
import os
import pathlib
import pwd
import shutil
import sqlite3
import json
import subprocess
import tempfile
import sys

if os.geteuid() == 0 or pwd.getpwuid(os.geteuid()).pw_name != "bitcoinwalk":
    raise SystemExit("Use the non-root bitcoinwalk account.")
os.umask(0o077)
os.environ["XDG_RUNTIME_DIR"] = f"/run/user/{os.getuid()}"
release = pathlib.Path("/opt/bitcoinwalk-app-staging/current").resolve()
if str(release) != "/opt/bitcoinwalk-app-staging/releases/0.3.243-5b029a612f82":
    raise SystemExit("Unexpected staging release.")
db = sqlite3.connect("file:/var/lib/bitcoinwalk-app-staging/payments.sqlite?mode=ro", uri=True)
row = db.execute("SELECT phase,config FROM rustress_managed_reservation_task WHERE city=?", ("5c1c04f5-aead-4265-bce7-0f9ce0d9b5cd",)).fetchone()
confirm_public = sys.argv[1:] == ["--confirm-public"]
if sys.argv[1:] and not confirm_public:
    raise SystemExit("Unknown activation option.")
if confirm_public:
    active = db.execute("SELECT phase,nip05,lnurl FROM rustress_activation_task WHERE city=?", ("5c1c04f5-aead-4265-bce7-0f9ce0d9b5cd",)).fetchone()
    if active != ("active", "active", "active"):
        raise SystemExit("Public HTTPS read-back must pass first.")
db.close()
if not row or row[0] != "verified" or json.loads(row[1])["invoiceIssuance"] != "disabled":
    raise SystemExit("Disabled reservation must be verified first.")
target = pathlib.Path("/home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service.d/zz-islamabad-managed-reservation.conf")
text = target.read_text()
for line in ["Environment=BITCOINWALK_RUSTRESS_MANAGED_CITIES=5c1c04f5-aead-4265-bce7-0f9ce0d9b5cd", "Environment=BITCOINWALK_RUSTRESS_MANAGED_MADEIRA_PILOT=", "Environment=BITCOINWALK_RUSTRESS_NIP05_ENABLED=0", "Environment=BITCOINWALK_RUSTRESS_LNURL_ENABLED=0", f"Environment=BITCOINWALK_RUSTRESS_ACTIVATION_ENABLED={1 if confirm_public else 0}"]:
    if line not in text.splitlines():
        raise SystemExit("Unexpected managed reservation gates.")
backup = pathlib.Path(tempfile.mkdtemp(prefix="bw99-provider-activation.", dir="/home/bitcoinwalk/backups"))
shutil.copy2(target, backup / "previous.conf")
temporary = target.with_name(target.name + ".next")
updated = text.replace("Environment=BITCOINWALK_RUSTRESS_ACTIVATION_ENABLED=0", "Environment=BITCOINWALK_RUSTRESS_ACTIVATION_ENABLED=1")
if confirm_public:
    for capability in ["NIP05", "LNURL"]:
        updated = updated.replace(f"Environment=BITCOINWALK_RUSTRESS_{capability}_ENABLED=0", f"Environment=BITCOINWALK_RUSTRESS_{capability}_ENABLED=1")
temporary.write_text(updated)
temporary.chmod(0o600)
os.replace(temporary, target)
try:
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "--user", "restart", "bitcoinwalk-app-staging.service"], check=True)
except Exception:
    shutil.copy2(backup / "previous.conf", target)
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=False)
    subprocess.run(["systemctl", "--user", "restart", "bitcoinwalk-app-staging.service"], check=False)
    raise
print(f"Islamabad activation configuration accepted; public_verified={confirm_public}. Evidence: {backup}")
