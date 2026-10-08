#!/usr/bin/env python3
"""Rehearse authenticated synthetic backup, restore and rollback."""
import argparse, hashlib, json, os, shutil, subprocess
from pathlib import Path

parser=argparse.ArgumentParser(); parser.add_argument('checkout',type=Path); parser.add_argument('--go',default='go'); args=parser.parse_args()
base=Path(__file__).resolve().parent; root=base.parents[1]; checkout=args.checkout.resolve()
pin='a231ed34a660cd86c0bd7f36282f7eb0dc90223f'
if os.getuid()==0: raise SystemExit('Non-root only')
if subprocess.check_output(['git','rev-parse','HEAD'],cwd=checkout,text=True).strip()!=pin: raise SystemExit('Wrong upstream revision')
patches=[base/name for name in ('isolated-candidate.patch','unknown-outcome.patch','legacy-failed-audit.patch','capability-binding.patch','frontend-lock.patch')]
for patch in reversed(patches): subprocess.run(['git','apply','--reverse','--check',str(patch)],cwd=checkout,check=True)
target=checkout/'transactions/bitcoinwalk_backup_restore_test.go'; shutil.copy2(base/'bitcoinwalk_backup_restore_test.go',target)
output=root/'release-build/alby-fee-cap-backup-restore'; output.mkdir(parents=True,exist_ok=True)
go_log=output/'hub-backup.jsonl'; app_log=output/'app-backup.json'
with go_log.open('w') as log:
    go_result=subprocess.run([args.go,'test','-race','./transactions','-run','^TestBitcoinWalkEncryptedBackupRestoreRollback$','-count=3','-timeout=3m','-json'],cwd=checkout,env=dict(os.environ,TEST_DATABASE_URI=''),stdout=log,stderr=subprocess.STDOUT)
app_result=subprocess.run(['npx','vitest','run','src/rustress/backup-envelope.test.ts','src/rustress/payout-recovery.test.ts','--reporter=json','--outputFile',str(app_log)],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
result=go_result.returncode or app_result.returncode
manifest={'upstream':pin,'productionReady':False,'exitCode':result,'status':'blocked' if result else 'tested-only','candidateRevision':'6bb8520025d781f8570ef1a5d134fe545a1586f3ab46cfedd780e15a641cfa84','patches':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in patches},'hubLogSha256':hashlib.sha256(go_log.read_bytes()).hexdigest(),'appLogSha256':hashlib.sha256(app_log.read_bytes()).hexdigest() if app_log.exists() else None,'scope':'authenticated synthetic Hub workdir, payout ledger and independent journal restore/rollback; no live Hub, LDK recovery file, wallet, credentials, relay or funds'}
(output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Backup rehearsal failed; production remains disabled.' if result else 'Authenticated synthetic backup/restore/rollback passed; production remains disabled pending the final staging gate.')
raise SystemExit(result)
