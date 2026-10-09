#!/usr/bin/env python3
"""Retain 48 hours, 14 daily, 8 weekly and 12 monthly points per component."""
from datetime import datetime,timedelta,timezone
from pathlib import Path
import os,re
root=Path(os.environ.get('BITCOINWALK_PAYOUT_BACKUP_DIR','/home/bitcoinwalk/offhost-payout-backups/archives'))
pattern=re.compile(r'^(payout-(ledger|journal)|receipt-(worker|signer))-(\d{8}T\d{6}Z)-v[0-9]+\.tar\.zst\.gpg$')
def main():
 if not root.is_dir() or root.is_symlink(): raise SystemExit('payout backup directory is missing or unsafe')
 rows={name:[] for name in ('payout-ledger','payout-journal','receipt-worker','receipt-signer')}
 for path in root.iterdir():
  match=pattern.fullmatch(path.name)
  if match and path.is_file() and not path.is_symlink():rows[match.group(1)].append((datetime.strptime(match.group(4),'%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc),path))
 for values in rows.values():
  values.sort(reverse=True);keep={path for when,path in values if when>=datetime.now(timezone.utc)-timedelta(hours=48)}
  for key,limit in ((lambda d:d.date(),14),(lambda d:(d.isocalendar().year,d.isocalendar().week),8),(lambda d:(d.year,d.month),12)):
   seen=set()
   for when,path in values:
    bucket=key(when)
    if bucket in seen or len(seen)>=limit:continue
    seen.add(bucket);keep.add(path)
  for _,path in values:
   if path not in keep:path.unlink();path.with_name(path.name+'.sha256').unlink(missing_ok=True)
if __name__=='__main__':main()
