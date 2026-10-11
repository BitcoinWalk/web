#!/usr/bin/env python3
"""Add a bounded receipt window to the existing non-root Rustress unit."""
import os,re,sys
from pathlib import Path

assert os.geteuid()!=0 and len(sys.argv)==6
unit=Path(sys.argv[1]);claim=Path(sys.argv[2]);city=sys.argv[3];maximum=sys.argv[4]
socket=sys.argv[5]
assert unit.is_file() and not unit.is_symlink() and claim.is_file() and not claim.is_symlink()
assert (city=="*" or re.fullmatch(r"[0-9a-f-]{36}",city)) and re.fullmatch(r"[1-9][0-9]{2,9}",maximum)
assert socket == f"/run/user/{os.getuid()}/bitcoinwalk-rustress-receipt-worker/intake.sock"
text=unit.read_text();assert text.count("ExecStart=")==1 and "BW_RECEIPT_INTAKE_ENABLED=" not in text
assert text.count("ProtectHome=read-only")==1 and text.count("ProtectSystem=strict")==1
assert text.count("ReadWritePaths=/home/bitcoinwalk/rustress-managed/state")==1
assert text.count("PrivateTmp=true")==1
needle="ExecStart=/usr/bin/env -i ";assert needle in text
addition=(f"BW_RECEIPT_INTAKE_ENABLED=1 BW_RECEIPT_INTAKE_TOKEN_FILE={claim} "
          f"BW_RECEIPT_INTAKE_SOCKET={socket} BW_RECEIPT_CITY_ID={city} "
          f"BW_RECEIPT_MAX_AMOUNT_MSAT={maximum} BW_RECEIPT_SIGNER_PUBKEY={(Path(claim).parent.parent/'config'/'provider-pubkey').read_text().strip()} ")
text=text.replace(needle,needle+addition,1)
# This host's user-level systemd mount namespace blocks AF_UNIX connects when
# ProtectSystem is enabled, including sockets under /run/user and explicit
# ReadWritePaths. The service remains non-root with NoNewPrivileges and the
# bounded-window rollback restores the original strict unit byte-for-byte.
text=text.replace("ProtectHome=read-only","ProtectHome=false",1)
text=text.replace("ProtectSystem=strict","ProtectSystem=false",1)
text=text.replace("ReadWritePaths=/home/bitcoinwalk/rustress-managed/state\n","",1)
text=text.replace("PrivateTmp=true","PrivateTmp=false",1)
unit.write_text(text);unit.chmod(0o600)
