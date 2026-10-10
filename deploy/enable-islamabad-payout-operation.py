#!/usr/bin/env python3
"""Apply the reviewed two-city operation; preserve existing wallet policy."""
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
cities = ["5c1c04f5-aead-4265-bce7-0f9ce0d9b5cd", "ca20993a-5b7f-443e-931e-8dbaa61d05fe"]
for path in [candidate, config / "operation.json", config / "operation-cities.json", launcher, incoming / "start-operation.sh"]:
    if path.is_symlink() or not path.is_file() or path.stat().st_uid != os.getuid():
        raise SystemExit("Unexpected deployment input.")
old = json.loads(json.loads((config / "operation.json").read_text())["content"])
new = json.loads(json.loads(candidate.read_text())["content"])
for key in ["contract", "mode", "release", "binding", "journalServiceId", "budgetMsat", "maximumPayoutMsat", "maximumFeeMsat"]:
    if new[key] != old[key]:
        raise SystemExit("Existing operation policy changed; stopping.")
if old["cityIds"] != [cities[1]] or new["cityIds"] != cities:
    raise SystemExit("Unexpected city authorization set.")
pathlib.Path("/home/bitcoinwalk/backups").mkdir(mode=0o700, exist_ok=True)
backup = pathlib.Path(tempfile.mkdtemp(prefix="bw99-payout-operation.", dir="/home/bitcoinwalk/backups"))
for name in ["operation.json", "operation-cities.json"]:
    shutil.copy2(config / name, backup / name)
shutil.copy2(launcher, backup / "start-operation.sh")
def atomic_copy(source, target):
    temporary = target.with_name(target.name + ".bw99-next")
    shutil.copy2(source, temporary)
    os.replace(temporary, target)
try:
    atomic_copy(incoming / "start-operation.sh", launcher)
    launcher.chmod(0o700)
    temporary = config / "operation-cities.bw99-next.json"
    temporary.write_text(json.dumps({"cityIds": cities}) + "\n")
    temporary.chmod(0o600)
    os.replace(temporary, config / "operation-cities.json")
    # The deployed runtime independently verifies the exact signed policy
    # before this launcher stops or replaces the existing service.
    subprocess.run(["sh", str(launcher), str(candidate)], check=True)
except Exception:
    atomic_copy(backup / "operation-cities.json", config / "operation-cities.json")
    atomic_copy(backup / "start-operation.sh", launcher)
    subprocess.run(["systemctl", "--user", "enable", "--now", "bitcoinwalk-payout-operation-expiry.timer"], check=False)
    raise SystemExit(f"Operation upgrade failed; prior configuration restored where possible. Evidence: {backup}")
print(f"BW99_PAYOUT_OPERATION_ACTIVE authorizedCities=2 evidence={backup}")
