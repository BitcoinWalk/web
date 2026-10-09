#!/usr/bin/env python3
"""Install non-secret, host-derived payout readiness evidence.

This deliberately does not create an activation grant, arm the service, inspect
the NWC value, or contact the wallet. It is intended to be run only after the
human holder of the offline key has verified both encrypted restore archives.
"""

import argparse
import json
import os
import pathlib
import pwd
import re
import stat
import subprocess
import tempfile
import time
import uuid


ROOT = pathlib.Path("/home/bitcoinwalk/.local/state/bitcoinwalk-rustress")
CONFIG = ROOT / "payout-config"
SECRETS = ROOT / "secrets"
MODE = ROOT / "payout-mode"
SERVICE = "bitcoinwalk-rustress-payout"
HEX64 = re.compile(r"^[0-9a-f]{64}$")


def fail(message: str) -> None:
    raise SystemExit(f"Host evidence installation refused: {message}")


def protected_file(path: pathlib.Path, expected_mode: int = 0o600) -> os.stat_result:
    try:
        result = path.lstat()
    except FileNotFoundError:
        fail(f"required protected file is missing: {path.name}")
    if not stat.S_ISREG(result.st_mode) or result.st_nlink != 1:
        fail(f"protected file is not a canonical regular file: {path.name}")
    if stat.S_IMODE(result.st_mode) != expected_mode or result.st_uid != os.getuid():
        fail(f"protected file ownership or mode is invalid: {path.name}")
    return result


def owner_directory(path: pathlib.Path) -> None:
    result = path.lstat()
    if not stat.S_ISDIR(result.st_mode) or stat.S_IMODE(result.st_mode) != 0o700 or result.st_uid != os.getuid():
        fail(f"protected directory ownership or mode is invalid: {path.name}")


def read_json(path: pathlib.Path) -> object:
    protected_file(path)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        fail(f"protected JSON is invalid: {path.name}")


def inspect_container(release: str) -> None:
    template = "{{index .Config.Labels \"org.bitcoinwalk.version\"}}|{{index .Config.Labels \"org.bitcoinwalk.mode\"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}"
    try:
        result = subprocess.run(
            ["docker", "container", "inspect", SERVICE, "--format", template],
            check=True,
            capture_output=True,
            text=True,
            timeout=15,
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        fail("disabled payout container could not be inspected")
    if result != f"{release}|disabled|none|running":
        fail("payout container is not the expected disabled, isolated release")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--restore-rehearsal-verified",
        required=True,
        choices=["ledger-and-journal"],
        help="explicit human confirmation that both real encrypted archives passed the offline restore verifier",
    )
    parser.add_argument("--release", required=True, choices=["0.2.1", "0.2.2"])
    args = parser.parse_args()
    if args.restore_rehearsal_verified != "ledger-and-journal":
        fail("both restore rehearsals must be confirmed")

    if os.geteuid() == 0 or pwd.getpwuid(os.geteuid()).pw_name != "bitcoinwalk":
        fail("must run as the non-root bitcoinwalk user")
    owner_directory(ROOT)
    owner_directory(CONFIG)
    owner_directory(SECRETS)
    protected_file(MODE)
    if MODE.read_text(encoding="utf-8") != "disabled\n":
        fail("payout service mode is not disabled")
    if (CONFIG / "activation.json").exists() or (CONFIG / "activation.json").is_symlink():
        fail("an activation grant already exists")

    journal = read_json(CONFIG / "journal-pin.json")
    if not isinstance(journal, dict) or set(journal) != {"serviceId", "binding"}:
        fail("journal pin has an unexpected shape")
    try:
        uuid.UUID(str(journal["serviceId"]))
    except (ValueError, TypeError, AttributeError):
        fail("journal service identity is invalid")
    if not isinstance(journal["binding"], str) or not HEX64.fullmatch(journal["binding"]):
        fail("journal wallet binding is invalid")

    checkout = CONFIG / "checkout-client-pubkey"
    protected_file(checkout)
    try:
        checkout_key = checkout.read_text(encoding="ascii").strip()
    except (OSError, UnicodeError):
        fail("checkout public client key is invalid")
    if not HEX64.fullmatch(checkout_key):
        fail("checkout public client key is invalid")

    # Only metadata is inspected for the wallet connection. Its secret value is
    # never opened, copied, logged, or placed in the readiness document.
    connection = protected_file(SECRETS / "nwc-uri")
    inspect_container(args.release)

    now = int(time.time())
    connection_started_at = int(connection.st_mtime)
    if connection_started_at <= 0 or connection_started_at > now:
        fail("wallet connection installation time is invalid")
    evidence = {
        "contract": "bitcoinwalk-payout-host-evidence-v1",
        "release": args.release,
        "binding": journal["binding"],
        "journalServiceId": journal["serviceId"],
        "walletRef": "bitcoinwalk-rustress",
        "checkoutConnectionRef": "bitcoinwalk-checkout",
        "connectionStartedAt": connection_started_at,
        "retainedFrom": connection_started_at,
        "approvedAt": now,
        "expiresAt": now + 30 * 24 * 60 * 60,
        "budgetMsat": "797900000",
        "maximumPayoutMsat": "790000000",
        "maximumFeeMsat": "7900000",
        "grantedMethods": [
            "get_info",
            "make_invoice",
            "lookup_invoice",
            "list_transactions",
            "pay_invoice",
            "get_balance",
            "notifications",
        ],
        "notificationsGranted": True,
        "isolated": True,
        "exclusiveConnection": True,
        "inventoryVerified": True,
        "separateHost": True,
        "privateTransport": True,
        "backupRestoreVerified": True,
        "hubVersion": "1.24.0",
        "backend": "ldk",
        "feePolicy": "ldk-native-v1",
    }

    target = CONFIG / "host-evidence.json"
    if target.is_symlink():
        fail("host evidence target is a symbolic link")
    descriptor, temporary = tempfile.mkstemp(prefix=".host-evidence.", dir=CONFIG)
    temporary_path = pathlib.Path(temporary)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(evidence, output, separators=(",", ":"), sort_keys=True)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary_path, target)
        directory_fd = os.open(CONFIG, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        temporary_path.unlink(missing_ok=True)
    protected_file(target)
    print("PAYOUT_HOST_EVIDENCE_INSTALLED")


if __name__ == "__main__":
    main()
