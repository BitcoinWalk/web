#!/usr/bin/env python3
"""Restore Islamabad's previously approved public address projection only."""
import json
import hashlib
import os
import pathlib
import pwd
import sqlite3
import tempfile
import time
import urllib.request

CITY = "5c1c04f5-aead-4265-bce7-0f9ce0d9b5cd"
SOURCE = pathlib.Path("/var/lib/bitcoinwalk-app-staging/payments.sqlite")
TARGET = pathlib.Path("/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite")
COLUMNS = ("city", "request", "reserved_config", "activation_config", "proof", "public_origin", "phase", "nip05", "lnurl", "lease", "until", "updated_at")


def read_json(url):
    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "BitcoinWalk-Islamabad-Projection-Restore/1"})
    with urllib.request.urlopen(request, timeout=15) as response:
        if response.status != 200:
            raise RuntimeError(f"Public read-back returned HTTP {response.status}.")
        return json.load(response)


if os.geteuid() == 0 or pwd.getpwuid(os.geteuid()).pw_name != "bitcoinwalk":
    raise SystemExit("Run as the non-root bitcoinwalk account.")

source = sqlite3.connect(f"file:{SOURCE}?mode=ro", uri=True)
source.row_factory = sqlite3.Row
row = source.execute(f"SELECT {','.join(COLUMNS)} FROM rustress_activation_task WHERE city=?", (CITY,)).fetchone()
if not row:
    raise SystemExit("Islamabad staging activation evidence is missing.")
config = json.loads(row["activation_config"])
if (row["public_origin"] != "https://bitcoinwalk.org" or config.get("cityId") != CITY or
        config.get("domain") != "bitcoinwalk.org" or config.get("localPart") != "islamabad" or
        config.get("invoiceIssuance") != "enabled" or config.get("organizerBasisPoints") != 7900 or
        config.get("retainedBasisPoints") != 2100 or not isinstance(config.get("brandPubkey"), str) or
        len(config["brandPubkey"]) != 64):
    raise SystemExit("Islamabad staging activation evidence does not match the approved public projection.")

backup = pathlib.Path(tempfile.mkdtemp(prefix="islamabad-public-projection-restore-", dir="/home/bitcoinwalk/backups"))
with sqlite3.connect(backup / "staging.before.sqlite") as saved:
    source.backup(saved)
source.close()
target = sqlite3.connect(TARGET, timeout=30)
target.row_factory = sqlite3.Row
with sqlite3.connect(backup / "payments.before.sqlite") as saved:
    target.backup(saved)
previous = target.execute(f"SELECT {','.join(COLUMNS)} FROM rustress_activation_task WHERE city=?", (CITY,)).fetchone()
conflict = target.execute("SELECT city FROM rustress_activation_task WHERE request=? AND city<>?", (row["request"], CITY)).fetchone()
if conflict:
    raise SystemExit("Islamabad request authority is already bound to another city.")
authority_fields = ("request", "reserved_config", "activation_config", "proof", "public_origin")
differences = [key for key in authority_fields if previous and previous[key] != row[key]]
safe_version_upgrade = False
if differences == ["reserved_config", "activation_config"]:
    current_reserved, approved_reserved = json.loads(previous["reserved_config"]), json.loads(row["reserved_config"])
    current_activation, approved_activation = json.loads(previous["activation_config"]), json.loads(row["activation_config"])
    def without_versions(value):
        return {key: item for key, item in value.items() if key not in ("version", "payoutVersion")}
    safe_version_upgrade = (current_reserved.get("version") == 1 and approved_reserved.get("version") == 2 and
                            current_activation.get("version") == 2 and approved_activation.get("version") == 3 and
                            current_reserved.get("payoutVersion") == current_activation.get("payoutVersion") == 3 and
                            approved_reserved.get("payoutVersion") == approved_activation.get("payoutVersion") == 4 and
                            without_versions(current_reserved) == without_versions(approved_reserved) and
                            without_versions(current_activation) == without_versions(approved_activation))
if differences and not safe_version_upgrade:
    target_config = json.loads(previous["activation_config"])
    safe = {
        "result": "EXISTING_PROJECTION_DIFFERS",
        "fields": differences,
        "currentState": {key: previous[key] for key in ("phase", "nip05", "lnurl")},
        "currentPublicConfig": {key: target_config.get(key) for key in ("cityId", "domain", "localPart", "brandPubkey", "version", "payoutVersion", "invoiceIssuance", "organizerBasisPoints", "retainedBasisPoints")},
        "approvedPublicConfig": {key: config.get(key) for key in ("cityId", "domain", "localPart", "brandPubkey", "version", "payoutVersion", "invoiceIssuance", "organizerBasisPoints", "retainedBasisPoints")},
        "currentConfigHash": hashlib.sha256(previous["activation_config"].encode()).hexdigest(),
        "approvedConfigHash": hashlib.sha256(row["activation_config"].encode()).hexdigest(),
        "reservedChangedKeys": sorted(key for key in set(current_reserved) | set(approved_reserved) if current_reserved.get(key) != approved_reserved.get(key)) if differences == ["reserved_config", "activation_config"] else [],
        "activationChangedKeys": sorted(key for key in set(current_activation) | set(approved_activation) if current_activation.get(key) != approved_activation.get(key)) if differences == ["reserved_config", "activation_config"] else [],
        "samePayoutDestination": current_activation.get("payoutDestination") == approved_activation.get("payoutDestination") if differences == ["reserved_config", "activation_config"] else False,
        "reservationVersions": {"current": current_reserved.get("version"), "approved": approved_reserved.get("version"), "currentPayout": current_reserved.get("payoutVersion"), "approvedPayout": approved_reserved.get("payoutVersion")} if differences == ["reserved_config", "activation_config"] else {},
        "activationVersions": {"current": current_activation.get("version"), "approved": approved_activation.get("version"), "currentPayout": current_activation.get("payoutVersion"), "approvedPayout": approved_activation.get("payoutVersion")} if differences == ["reserved_config", "activation_config"] else {},
    }
    raise SystemExit(json.dumps(safe))

values = [row[key] for key in COLUMNS]
values[6:12] = ["verifying", "provisioning", "provisioning", None, 0, int(time.time() * 1000)]
target.execute("BEGIN IMMEDIATE")
if previous:
    target.execute("UPDATE rustress_activation_task SET reserved_config=?,activation_config=?,phase='verifying',nip05='provisioning',lnurl='provisioning',lease=NULL,until=0,updated_at=? WHERE city=?", (row["reserved_config"], row["activation_config"], values[-1], CITY))
else:
    target.execute(f"INSERT INTO rustress_activation_task({','.join(COLUMNS)}) VALUES({','.join('?' for _ in COLUMNS)})", values)
target.commit()

try:
    nip05 = read_json("https://bitcoinwalk.org/.well-known/nostr.json?name=islamabad")
    lnurl = read_json("https://bitcoinwalk.org/.well-known/lnurlp/islamabad")
    if nip05.get("names", {}).get("islamabad") != config["brandPubkey"]:
        raise RuntimeError("NIP-05 public key does not match the approved Islamabad city key.")
    if lnurl.get("tag") != "payRequest" or not str(lnurl.get("callback", "")).startswith("https://"):
        raise RuntimeError("Islamabad Lightning metadata did not pass public read-back.")
    target.execute("UPDATE rustress_activation_task SET phase='active',nip05='active',lnurl='active',updated_at=? WHERE city=?", (int(time.time() * 1000), CITY))
    target.commit()

    # The public projection and its read-back are now exact. Record that same
    # result in staging without changing any authority or payout evidence.
    staging = sqlite3.connect(SOURCE, timeout=30)
    current = staging.execute(f"SELECT {','.join(COLUMNS)} FROM rustress_activation_task WHERE city=?", (CITY,)).fetchone()
    authority = tuple(current[index] for index in range(1, 6)) if current else ()
    expected = tuple(row[key] for key in COLUMNS[1:6])
    if authority != expected or current[9] is not None and current[10] > int(time.time() * 1000):
        staging.close()
        raise RuntimeError("Islamabad staging evidence changed during public verification.")
    updated = staging.execute("UPDATE rustress_activation_task SET phase='active',nip05='active',lnurl='active',lease=NULL,until=0,updated_at=? WHERE city=? AND request=? AND reserved_config=? AND activation_config=? AND proof=? AND public_origin=?",
                             (int(time.time() * 1000), CITY, row["request"], row["reserved_config"], row["activation_config"], row["proof"], row["public_origin"]))
    if updated.rowcount != 1:
        staging.rollback()
        staging.close()
        raise RuntimeError("Islamabad staging status was not reconciled.")
    staging.commit()
    staging.close()
except Exception:
    target.execute("BEGIN IMMEDIATE")
    if previous:
        target.execute(f"UPDATE rustress_activation_task SET {','.join(f'{key}=?' for key in COLUMNS[1:])} WHERE city=?", [previous[key] for key in COLUMNS[1:]] + [CITY])
    else:
        target.execute("DELETE FROM rustress_activation_task WHERE city=?", (CITY,))
    target.commit()
    raise
finally:
    target.close()

os.chmod(backup / "payments.before.sqlite", 0o600)
os.chmod(backup / "staging.before.sqlite", 0o600)
print(json.dumps({"result": "ISLAMABAD_PUBLIC_PROJECTION_RESTORED", "cityId": CITY, "nip05": "active", "lnurl": "active", "stagingReconciled": True, "backup": str(backup), "payoutEnrolmentEnabled": False}))
