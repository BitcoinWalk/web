#!/usr/bin/env python3
"""Non-root managed Rustress transport. Does not enable app activation or Caddy."""
import os
from pathlib import Path
import pwd
import re
import subprocess
import sys

assert os.geteuid()!=0 and pwd.getpwuid(os.geteuid()).pw_name=="bitcoinwalk"
os.umask(0o077)
home=Path("/home/bitcoinwalk");mode=sys.argv[1];root=home/".config"/"bitcoinwalk-rustress-managed-tunnel"
if mode in ("key","install"):
    assert not root.is_symlink();root.mkdir(mode=0o700,exist_ok=True);key=root/"id_ed25519"
    if mode=="key":
        assert not key.is_symlink()
        if not key.exists():subprocess.run(["ssh-keygen","-q","-t","ed25519","-N","","-C","bitcoinwalk-managed-rustress-only","-f",str(key)],check=True)
        print(key.with_suffix(".pub").read_text().strip())
    else:
        hostkey=sys.argv[2];assert re.fullmatch(r"ssh-ed25519 [A-Za-z0-9+/=]+",hostkey)
        known=root/"known_hosts";assert not known.is_symlink();pinned="213.232.235.240 "+hostkey+"\n"
        if known.exists():assert known.read_text()==pinned,"Pinned host key changed"
        else:known.write_text(pinned)
        unit_dir=home/".config"/"systemd"/"user";unit_dir.mkdir(parents=True,exist_ok=True);unit=unit_dir/"bitcoinwalk-rustress-managed-tunnel.service"
        assert not unit.is_symlink()
        if unit.exists():assert "# BitcoinWalk managed Rustress transport" in unit.read_text()
        unit.write_text(f"""# BitcoinWalk managed Rustress transport
[Unit]
Description=BitcoinWalk private managed Rustress transport
StartLimitIntervalSec=0
[Service]
ExecStart=/usr/bin/ssh -N -T -F /dev/null -i {key} -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile={known} -o ExitOnForwardFailure=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -L 127.0.0.1:18895:127.0.0.1:8895 bitcoinwalk@213.232.235.240
Restart=always
RestartSec=5
NoNewPrivileges=true
UMask=0077
MemoryMax=64M
TasksMax=16
[Install]
WantedBy=default.target
""")
        subprocess.run(["systemctl","--user","daemon-reload"],check=True);subprocess.run(["systemctl","--user","enable","--now",unit.name],check=True)
        print("Managed tunnel installed; app activation and public routing unchanged.")
elif mode=="authorize":
    public=sys.argv[2];assert re.fullmatch(r"ssh-ed25519 [A-Za-z0-9+/=]+ bitcoinwalk-managed-rustress-only",public)
    directory=home/".ssh";assert not directory.is_symlink();directory.mkdir(mode=0o700,exist_ok=True);keys=directory/"authorized_keys"
    assert keys.is_file() and not keys.is_symlink();old=keys.read_text()
    line='from="213.232.235.138",restrict,port-forwarding,permitopen="127.0.0.1:8895",command="/bin/false" '+public
    if public.split()[1] not in old:
        backup=directory/"authorized_keys.before-rustress-managed"
        with backup.open("x") as output:output.write(old)
        with keys.open("a") as output:output.write(("" if old.endswith("\n") else "\n")+line+"\n")
    else:assert line in old.splitlines(),"Existing key restrictions differ"
    print("Added managed-port-only key; existing SSH access preserved.")
else:raise ValueError("Expected key, authorize or install")
