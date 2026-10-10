#!/usr/bin/env python3
"""Open or close the production payout journal for one bounded acceptance window."""

import argparse
import json
import os
from pathlib import Path
import pwd
import stat
import subprocess
import urllib.request


STATE = Path("/home/bitcoinwalk/journal-production-0.1.0/state")
ORIGIN = "http://127.0.0.1:8894"
UNIT = "bitcoinwalk-journal-window-expiry"
INSTALLED = Path("/home/bitcoinwalk/.local/libexec/bitcoinwalk-payout-window/journal-window.py")


def fail(message: str) -> None:
    raise SystemExit(f"Journal window refused: {message}")


def token(name: str) -> str:
    path = STATE / name
    result = path.lstat()
    if not stat.S_ISREG(result.st_mode) or result.st_nlink != 1 or stat.S_IMODE(result.st_mode) != 0o600 or result.st_uid != os.getuid():
        fail("operator state is not protected")
    value = path.read_text(encoding="ascii").strip()
    if not 43 <= len(value) <= 256 or not value.replace("_", "").replace("-", "").isalnum():
        fail("operator state is invalid")
    return value


def request(path: str, credential: str, body: object | None = None) -> dict:
    data = None if body is None else json.dumps(body, separators=(",", ":")).encode()
    call = urllib.request.Request(ORIGIN + path, data=data, method="GET" if data is None else "POST", headers={
        "Authorization": "Bearer " + credential,
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(call, timeout=5) as response:
        if response.status != 200:
            fail("journal did not confirm the request")
        value = json.load(response)
    if not isinstance(value, dict):
        fail("journal returned invalid state")
    return value


def status() -> dict:
    value = request("/v1/journal/status", token("client.token"))
    if not isinstance(value.get("serviceId"), str) or not isinstance(value.get("binding"), str) or not isinstance(value.get("active"), bool):
        fail("journal returned invalid state")
    return value


def control(action: str, before: dict) -> dict:
    value = request("/v1/journal/control", token("operator.token"), {
        "serviceId": before["serviceId"], "expectedFence": before.get("fence"), "action": action,
    })
    if value.get("serviceId") != before["serviceId"] or value.get("binding") != before["binding"] or value.get("active") != (action == "activate") or value.get("fence") == before.get("fence"):
        fail("journal transition was not confirmed")
    return value


def pause(expired: bool = False) -> None:
    before = status()
    if before["active"]:
        control("pause", before)
    after = status()
    if after["active"]:
        fail("journal did not pause")
    if not expired:
        subprocess.run(["systemctl", "--user", "stop", UNIT + ".timer", UNIT + ".service"], check=False)
        subprocess.run(["systemctl", "--user", "reset-failed", UNIT + ".timer", UNIT + ".service"], check=False)
        subprocess.run(["systemctl", "--user", "daemon-reload"], check=False)
    print(f"PAYOUT_JOURNAL_PAUSED lastSequence={after.get('lastSequence', 0)}")


def activate(seconds: int) -> None:
    if seconds < 60 or seconds > 900:
        fail("window must be between 60 and 900 seconds")
    subprocess.run(["systemctl", "--user", "stop", UNIT + ".timer", UNIT + ".service"], check=False)
    subprocess.run(["systemctl", "--user", "reset-failed", UNIT + ".timer", UNIT + ".service"], check=False)
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=True, timeout=15)
    before = status()
    if before["active"]:
        fail("journal is already active")
    active = control("activate", before)
    try:
        subprocess.run([
            "systemd-run", "--user", "--quiet", "--unit", UNIT,
            f"--on-active={seconds}s", str(INSTALLED), "pause", "--expired",
        ], check=True, timeout=15)
        result = subprocess.run(["systemctl", "--user", "is-active", UNIT + ".timer"], check=False, capture_output=True, text=True, timeout=15)
        if result.stdout.strip() != "active":
            raise subprocess.SubprocessError("journal expiry timer is not active")
    except (OSError, subprocess.SubprocessError):
        control("pause", active)
        fail("automatic pause could not be scheduled")
    print(f"PAYOUT_JOURNAL_ACTIVE seconds={seconds} lastSequence={active.get('lastSequence', 0)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["activate", "pause", "status"])
    parser.add_argument("--seconds", type=int)
    parser.add_argument("--expired", action="store_true")
    args = parser.parse_args()
    if os.geteuid() == 0 or pwd.getpwuid(os.geteuid()).pw_name != "bitcoinwalk":
        fail("must run as the non-root bitcoinwalk user")
    if args.action == "activate":
        if args.seconds is None:
            fail("activation duration is required")
        activate(args.seconds)
    elif args.action == "pause":
        pause(args.expired)
    else:
        value = status()
        print(f"PAYOUT_JOURNAL_STATUS active={str(value['active']).lower()} lastSequence={value.get('lastSequence', 0)} fence={'present' if value.get('fence') else 'absent'}")


if __name__ == "__main__":
    main()
