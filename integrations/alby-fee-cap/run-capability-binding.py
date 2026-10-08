#!/usr/bin/env python3
"""Verify exact Hub capability attestation and BitcoinWalk runtime binding."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('checkout', type=Path)
parser.add_argument('--go', default='go')
args = parser.parse_args()
base = Path(__file__).resolve().parent
root = base.parents[1]
checkout = args.checkout.resolve()
pin = 'a231ed34a660cd86c0bd7f36282f7eb0dc90223f'
if os.getuid() == 0:
    raise SystemExit('Non-root only')
if subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=checkout, text=True).strip() != pin:
    raise SystemExit('Wrong upstream revision')
patches = [base / name for name in ('isolated-candidate.patch', 'unknown-outcome.patch', 'legacy-failed-audit.patch', 'capability-binding.patch', 'frontend-lock.patch')]
for patch in reversed(patches):
    subprocess.run(['git', 'apply', '--reverse', '--check', str(patch)], cwd=checkout, check=True)
output = root / 'release-build/alby-fee-cap-capability-binding'
output.mkdir(parents=True, exist_ok=True)
manifest = output / 'manifest.json'
manifest.unlink(missing_ok=True)
go_command = [args.go, 'test', '-race', './lnclient/ldk', './nip47/controllers', '-run', 'TestBitcoinWalk(PaymentSafetyCapability|GetInfo)', '-count=3', '-timeout=3m', '-json']
with (output / 'hub-capability.jsonl').open('w') as log:
    go_result = subprocess.run(go_command, cwd=checkout, env=dict(os.environ, TEST_DATABASE_URI=''), stdout=log, stderr=subprocess.STDOUT)
app_command = ['npx', 'vitest', 'run', 'src/rustress/hub-capability.test.ts', 'src/rustress/payout-runtime.test.ts', 'src/rustress/nwc-reader.test.ts', '--reporter=json', '--outputFile', str(output / 'app-capability.json')]
app_result = subprocess.run(app_command, cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
result = go_result.returncode or app_result.returncode
manifest.write_text(json.dumps({
    'upstream': pin, 'productionReady': False, 'exitCode': result,
    'status': 'blocked' if result else 'tested-only',
    'candidateRevision': '6bb8520025d781f8570ef1a5d134fe545a1586f3ab46cfedd780e15a641cfa84',
    'patches': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in patches},
    'hubLogSha256': hashlib.sha256((output / 'hub-capability.jsonl').read_bytes()).hexdigest(),
    'appLogSha256': hashlib.sha256((output / 'app-capability.json').read_bytes()).hexdigest() if (output / 'app-capability.json').exists() else None,
    'scope': 'signed NWC get_info capability contract and default-off payout-runtime gate; synthetic keys and mocks, no live Hub, relay, wallet, credentials or funds',
}, indent=2) + '\n')
print('Capability binding failed; production remains disabled.' if result else 'Exact Hub capability binding passed; production remains disabled pending remaining gates.')
raise SystemExit(result)
