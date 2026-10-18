#!/usr/bin/env python3
"""Apply the reviewed Rye expansion while preserving the existing wallet policy."""
import json
import os
import pathlib
import pwd
import shutil
import subprocess
import tempfile

if os.geteuid() == 0 or pwd.getpwuid(os.geteuid()).pw_name != "bitcoinwalk":
    raise SystemExit("Use the non-root bitcoinwalk account.")
os.umask(0o077)
os.environ["XDG_RUNTIME_DIR"] = f"/run/user/{os.getuid()}"
root = pathlib.Path("/home/bitcoinwalk/.local/state/bitcoinwalk-rustress")
config = root / "payout-config"
incoming = pathlib.Path(__file__).resolve().parent
candidate = incoming / "operation.next.json"
launcher = pathlib.Path("/home/bitcoinwalk/.local/libexec/bitcoinwalk-rustress-payout-operation/start.sh")
old_cities = ["ca20993a-5b7f-443e-931e-8dbaa61d05fe", "ca2f9905-fb4d-4948-a12c-c792b28ec7c8"]
new_cities = ["530af607-e1c8-47f4-a5af-c200a965420b", *old_cities]
for path in [candidate, config / "operation.json", config / "operation-cities.json", launcher]:
    if path.is_symlink() or not path.is_file() or path.stat().st_uid != os.getuid():
        raise SystemExit("Unexpected deployment input.")
old = json.loads(json.loads((config / "operation.json").read_text())["content"])
new = json.loads(json.loads(candidate.read_text())["content"])
for key in ["contract", "mode", "release", "binding", "journalServiceId", "budgetMsat", "maximumPayoutMsat", "maximumFeeMsat"]:
    if new[key] != old[key]:
        raise SystemExit("Existing operation policy changed; stopping.")
if old["cityIds"] != old_cities or new["cityIds"] != new_cities:
    raise SystemExit("Unexpected city authorization set.")
pathlib.Path("/home/bitcoinwalk/backups").mkdir(mode=0o700, exist_ok=True)
backup = pathlib.Path(tempfile.mkdtemp(prefix="rye-payout-operation.", dir="/home/bitcoinwalk/backups"))
for name in ["operation.json", "operation-cities.json"]:
    shutil.copy2(config / name, backup / name)
try:
    temporary = config / "operation-cities.rye-next.json"
    temporary.write_text(json.dumps({"cityIds": new_cities}) + "\n")
    temporary.chmod(0o600)
    os.replace(temporary, config / "operation-cities.json")
    # The installed launcher independently verifies the signature and exact
    # policy before it can replace the invoice-only service.
    subprocess.run(["sh", str(launcher), str(candidate)], check=True)
except Exception:
    temporary = config / "operation-cities.rye-rollback.json"
    shutil.copy2(backup / "operation-cities.json", temporary)
    os.replace(temporary, config / "operation-cities.json")
    raise SystemExit(f"Rye operation activation failed closed. Evidence: {backup}")
print(f"RYE_PAYOUT_OPERATION_ACTIVE authorizedCities=3 evidence={backup}")
