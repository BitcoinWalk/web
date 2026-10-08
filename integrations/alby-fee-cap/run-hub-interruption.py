#!/usr/bin/env python3
"""Run complete-Hub native-LDK interruption recovery on private regtest."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('checkout', type=Path)
parser.add_argument('--bitcoind', required=True, type=Path)
parser.add_argument('--go', default='go')
args = parser.parse_args()
base = Path(__file__).resolve().parent
checkout = args.checkout.resolve()
binary = args.bitcoind.resolve(strict=True)
pin = 'a231ed34a660cd86c0bd7f36282f7eb0dc90223f'
if os.getuid() == 0:
    raise SystemExit('Non-root only')
if subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=checkout, text=True).strip() != pin:
    raise SystemExit('Wrong upstream revision')
patches = [base / name for name in ('isolated-candidate.patch', 'unknown-outcome.patch', 'legacy-failed-audit.patch', 'capability-binding.patch', 'frontend-lock.patch')]
for patch in reversed(patches):
    subprocess.run(['git', 'apply', '--reverse', '--check', str(patch)], cwd=checkout, check=True)
source = base / 'bitcoinwalk_hub_interruption_test.go'
target = checkout / 'service/bitcoinwalk_hub_interruption_test.go'
if target.exists() and target.read_bytes() != source.read_bytes():
    raise SystemExit('Existing Hub interruption test differs; review before replacing')
shutil.copyfile(source, target)
output = base.parents[1] / 'release-build/alby-fee-cap-hub-interruption'
output.mkdir(parents=True, exist_ok=True)
manifest_path = output / 'manifest.json'
manifest_path.unlink(missing_ok=True)
command = [args.go, 'test', './service', '-run', '^TestBitcoinWalkCompleteHubNativeInterruption$', '-count=1', '-timeout=12m', '-v']
with (output / 'hub-interruption.log').open('w') as log:
    result = subprocess.run(command, cwd=checkout, env=dict(os.environ, BW_REGTEST_BITCOIND=str(binary), TEST_DATABASE_URI=''), stdout=log, stderr=subprocess.STDOUT)
manifest = {
    'upstream': pin,
    'productionReady': False,
    'exitCode': result.returncode,
    'status': 'blocked' if result.returncode else 'tested-only',
    'patches': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in patches},
    'testSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'bitcoindSha256': hashlib.sha256(binary.read_bytes()).hexdigest(),
    'logSha256': hashlib.sha256((output / 'hub-interruption.log').read_bytes()).hexdigest(),
    'network': 'private regtest',
    'runsPassed': 0 if result.returncode else 1,
    'scope': 'complete Hub service, native LDK held payment, SIGKILL, restart, exact lookup reconciliation and no-resend assertion; no live wallet, relay or funds',
}
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
print('Complete-Hub interruption acceptance failed; production remains disabled.' if result.returncode else 'Complete-Hub interruption recovery passed; production remains disabled pending the remaining release gates.')
raise SystemExit(result.returncode)
