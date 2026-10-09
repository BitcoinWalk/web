#!/usr/bin/env python3
"""Rotate one payout API credential while the runtime is safely disabled.

The credential is never printed. Rotation keeps one owner-only previous value
for an explicit rollback; finalization removes it only after peer verification.
"""

import argparse
import os
import pathlib
import pwd
import secrets
import stat
import subprocess
import tempfile


ROOT = pathlib.Path("/home/bitcoinwalk/.local/state/bitcoinwalk-rustress")
SECRETS = ROOT / "secrets"
CONFIG = ROOT / "payout-config"
MODE = ROOT / "payout-mode"
ROLES = {"intake", "issuer", "receipt", "authority", "operations"}


def fail(message: str) -> None:
    raise SystemExit(f"Credential operation refused: {message}")


def regular(path: pathlib.Path, required: bool = True) -> bool:
    try:
        result = path.lstat()
    except FileNotFoundError:
        if required:
            fail(f"missing protected file: {path.name}")
        return False
    if not stat.S_ISREG(result.st_mode) or result.st_nlink != 1 or stat.S_IMODE(result.st_mode) != 0o600 or result.st_uid != os.getuid():
        fail(f"invalid protected file: {path.name}")
    return True


def disabled() -> None:
    if os.geteuid() == 0 or pwd.getpwuid(os.geteuid()).pw_name != "bitcoinwalk":
        fail("must run as non-root bitcoinwalk")
    for directory in (ROOT, SECRETS, CONFIG):
        result = directory.lstat()
        if not stat.S_ISDIR(result.st_mode) or stat.S_IMODE(result.st_mode) != 0o700 or result.st_uid != os.getuid():
            fail(f"invalid protected directory: {directory.name}")
    regular(MODE)
    if MODE.read_text(encoding="ascii") != "disabled\n":
        fail("payout runtime is not disabled")
    if (CONFIG / "activation.json").exists() or (CONFIG / "activation.json").is_symlink():
        fail("activation grant exists")
    try:
        value = subprocess.run(
            ["docker", "container", "inspect", "bitcoinwalk-rustress-payout", "--format", "{{index .Config.Labels \"org.bitcoinwalk.mode\"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}"],
            check=True,
            capture_output=True,
            text=True,
            timeout=15,
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        fail("payout container could not be inspected")
    if value != "disabled|none|running":
        fail("payout container is not disabled and isolated")


def write_new(target: pathlib.Path) -> None:
    descriptor, temporary = tempfile.mkstemp(prefix=f".{target.name}.", dir=SECRETS)
    temporary_path = pathlib.Path(temporary)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="ascii") as output:
            output.write(secrets.token_urlsafe(48) + "\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary_path, target)
        directory_fd = os.open(SECRETS, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        temporary_path.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["rotate", "rollback", "finalize"])
    parser.add_argument("--role", required=True, choices=sorted(ROLES))
    args = parser.parse_args()
    disabled()
    current = SECRETS / f"{args.role}-api-token"
    previous = SECRETS / f"{args.role}-api-token.previous"
    if args.action == "rotate":
        if regular(previous, False):
            fail("previous credential must be verified and finalized or rolled back first")
        if regular(current, False):
            os.replace(current, previous)
        write_new(current)
        regular(current)
        print(f"PAYOUT_API_CREDENTIAL_ROTATED role={args.role} previous={'yes' if previous.exists() else 'no'}")
    elif args.action == "rollback":
        regular(current)
        regular(previous)
        temporary = SECRETS / f".{args.role}-api-token.swap"
        if temporary.exists() or temporary.is_symlink():
            fail("unexpected swap file exists")
        os.replace(current, temporary)
        os.replace(previous, current)
        os.replace(temporary, previous)
        print(f"PAYOUT_API_CREDENTIAL_ROLLED_BACK role={args.role}")
    else:
        regular(current)
        regular(previous)
        previous.unlink()
        print(f"PAYOUT_API_CREDENTIAL_FINALIZED role={args.role}")


if __name__ == "__main__":
    main()
