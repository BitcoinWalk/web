#!/usr/bin/env python3
"""Enable all active city receipts through a loopback-only proxy."""
import os,re
from pathlib import Path

assert os.geteuid()!=0 and len(os.sys.argv)==5
unit=Path(os.sys.argv[1]);current=Path(os.sys.argv[2]);token=Path(os.sys.argv[3]);maximum=os.sys.argv[4]
assert unit.is_file() and not unit.is_symlink() and current.is_file() and not current.is_symlink() and token.is_file() and not token.is_symlink()
assert maximum=="1000000000"
text=unit.read_text()
live=current.read_text();found=re.findall(r"BW_PROVISION_REVISION=([0-9a-f]{64})",live);assert len(found)==1
revision=found[0];old=re.findall(r"BW_PROVISION_REVISION=([0-9a-f]{64})",text);assert len(old)==1 and text.count(old[0])==2
text=text.replace(old[0],revision)
signer=(token.parent.parent/'config'/'provider-pubkey').read_text().strip();assert re.fullmatch(r"[0-9a-f]{64}",signer)
assert text.count("ExecStart=")==1 and "BW_RECEIPT_INTAKE_ENABLED=" not in text
assert text.count("ProtectSystem=strict")==1 and text.count("ProtectHome=read-only")==1 and text.count("PrivateTmp=true")==1
needle="ExecStart=/usr/bin/env -i ";assert needle in text
addition=(f"BW_RECEIPT_INTAKE_ENABLED=1 BW_RECEIPT_INTAKE_TOKEN_FILE={token} "
          "BW_RECEIPT_INTAKE_SOCKET=tcp://127.0.0.1:8897 BW_RECEIPT_CITY_ID=* "
          f"BW_RECEIPT_MAX_AMOUNT_MSAT={maximum} BW_RECEIPT_SIGNER_PUBKEY={signer} ")
unit.write_text(text.replace(needle,needle+addition,1));unit.chmod(0o600)
