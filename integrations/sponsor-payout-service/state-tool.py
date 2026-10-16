#!/usr/bin/env python3
import json
import os
import pathlib
import sqlite3
import stat
import sys
import time


def regular(path: pathlib.Path) -> os.stat_result:
    value = path.lstat()
    if not stat.S_ISREG(value.st_mode) or stat.S_ISLNK(value.st_mode) or value.st_uid != os.getuid():
        raise RuntimeError()
    return value


def database(path: pathlib.Path) -> tuple[str, int]:
    regular(path)
    with sqlite3.connect(f"file:{path}?mode=ro", uri=True) as connection:
        if connection.execute("PRAGMA integrity_check").fetchone() != ("ok",):
            raise RuntimeError()
        row = connection.execute("SELECT mode,generation FROM sponsor_payout_service_state WHERE singleton=1").fetchone()
    if not row or row[0] != "disabled" or not isinstance(row[1], int) or row[1] < 1:
        raise RuntimeError()
    return row[0], row[1]


def backup(source: pathlib.Path, target: pathlib.Path) -> None:
    database(source)
    if target.exists() or target.is_symlink():
        raise RuntimeError()
    with sqlite3.connect(f"file:{source}?mode=ro", uri=True) as current, sqlite3.connect(target) as destination:
        current.backup(destination)
    os.chmod(target, 0o600)
    database(target)
    print("SPONSOR_PAYOUT_BACKUP_COPY_OK")


def verify_live(status_path: pathlib.Path, mode_path: pathlib.Path, database_path: pathlib.Path) -> None:
    for path in (status_path, mode_path, database_path):
        regular(path)
    if mode_path.read_text(encoding="utf-8") != "disabled\n":
        raise RuntimeError()
    status_value = json.loads(status_path.read_text(encoding="utf-8"))
    expected = {
        "service": "bitcoinwalk-sponsor-payout", "version": "0.1.1", "mode": "disabled",
        "payoutsEnabled": False, "hostInvitationsEnabled": False, "credentialLoaded": False,
        "networkAccess": False, "restartReconciliation": "blocked-disabled",
    }
    if not isinstance(status_value, dict) or set(status_value) != set(expected) | {"generation", "checkedAt"}:
        raise RuntimeError()
    if any(status_value.get(key) != value for key, value in expected.items()):
        raise RuntimeError()
    generation = status_value.get("generation")
    checked_at = status_value.get("checkedAt")
    now = int(time.time())
    if not isinstance(generation, int) or generation < 1 or not isinstance(checked_at, int) or checked_at > now + 5 or now - checked_at > 180:
        raise RuntimeError()
    _, stored_generation = database(database_path)
    if stored_generation != generation:
        raise RuntimeError()
    print("SPONSOR_PAYOUT_DISABLED_STATE_OK")


def main() -> None:
    if os.geteuid() == 0:
        raise RuntimeError()
    if len(sys.argv) == 4 and sys.argv[1] == "backup":
        backup(pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3]))
    elif len(sys.argv) == 3 and sys.argv[1] == "verify-backup":
        database(pathlib.Path(sys.argv[2]))
        print("SPONSOR_PAYOUT_RESTORE_OK")
    elif len(sys.argv) == 5 and sys.argv[1] == "verify-live":
        verify_live(pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3]), pathlib.Path(sys.argv[4]))
    else:
        raise RuntimeError()


try:
    main()
except Exception:
    print("Sponsor payout state verification failed.", file=sys.stderr)
    raise SystemExit(1)
