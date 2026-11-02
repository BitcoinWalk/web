#!/usr/bin/env python3
import os
import pathlib
import pwd
import shutil
import stat
import tempfile
import time

home = pathlib.Path.home()
source = home / ".ssh" / "authorized_keys"
entry = 'permitopen="127.0.0.1:8895"'
expanded = entry + ',permitopen="127.0.0.1:8893"'
info = source.lstat()
owner = pwd.getpwuid(os.getuid()).pw_name
if owner != "bitcoinwalk" or stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or info.st_uid != os.getuid() or info.st_nlink != 1:
    raise SystemExit("Restricted SSH authorization refused.")
text = source.read_text(encoding="utf-8")
if text.count(entry) != 1 or 'permitopen="127.0.0.1:8893"' in text:
    raise SystemExit("Restricted SSH authorization does not match the reviewed baseline.")
backup_dir = home / "backups"
backup_dir.mkdir(mode=0o700, exist_ok=True)
backup = backup_dir / f"authorized_keys.before-bw148-{int(time.time())}"
shutil.copy2(source, backup)
os.chmod(backup, 0o600)
handle, temporary = tempfile.mkstemp(prefix=".authorized_keys.", dir=source.parent)
try:
    with os.fdopen(handle, "w", encoding="utf-8") as output:
        output.write(text.replace(entry, expanded, 1))
        output.flush()
        os.fsync(output.fileno())
    os.chmod(temporary, 0o600)
    os.replace(temporary, source)
    directory = os.open(source.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
finally:
    pathlib.Path(temporary).unlink(missing_ok=True)
print(f"BW148_STAGING_TUNNEL_AUTHORIZED backup={backup}")
