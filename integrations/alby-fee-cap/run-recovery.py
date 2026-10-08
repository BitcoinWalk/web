#!/usr/bin/env python3
"""Run fault-injected controller/DB acceptance; any failing safety assertion blocks adoption."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('checkout', type=Path)
parser.add_argument('--go', default='go')
parser.add_argument('--race', action='store_true')
args = parser.parse_args()
base = Path(__file__).resolve().parent
checkout = args.checkout.resolve()
pin = 'a231ed34a660cd86c0bd7f36282f7eb0dc90223f'
if os.getuid() == 0:
    raise SystemExit('Non-root only')
if subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=checkout, text=True).strip() != pin:
    raise SystemExit('Wrong upstream revision')
patches = [base / name for name in ('isolated-candidate.patch', 'unknown-outcome.patch', 'legacy-failed-audit.patch', 'capability-binding.patch', 'frontend-lock.patch')]
for patch in reversed(patches):
    subprocess.run(['git', 'apply', '--reverse', '--check', str(patch)], cwd=checkout, check=True)
source = base / 'bitcoinwalk_recovery_test.go'
target = checkout / 'nip47/controllers/bitcoinwalk_recovery_test.go'
if target.exists() and target.read_bytes() != source.read_bytes():
    raise SystemExit('Existing recovery test differs; review before replacing')
shutil.copyfile(source, target)
output = base.parents[1] / 'release-build/alby-fee-cap-recovery'
output.mkdir(parents=True, exist_ok=True)
manifest = output / 'manifest.json'
manifest.unlink(missing_ok=True)
command = [args.go, 'test', './nip47/controllers', '-run', '^TestBitcoinWalk(ConcurrentNwcBudget|UncertainSendMustRetainReservation|AbruptProcessRecovery|LostNwcResponseAfterSettlement)$', '-count=3', '-timeout=3m', '-json']
if args.race:
    command.append('-race')
with (output / 'recovery.jsonl').open('w') as log:
    result = subprocess.run(command, cwd=checkout, env=dict(os.environ, TEST_DATABASE_URI='', BW_CRASH_CHILD=''), stdout=log, stderr=subprocess.STDOUT)
outcomes = []
for line in (output / 'recovery.jsonl').read_text().splitlines():
    try:
        item = json.loads(line)
    except ValueError:
        continue
    if item.get('Test') and item.get('Action') in ('pass', 'fail'):
        outcomes.append({'test': item['Test'], 'result': item['Action']})
manifest.write_text(json.dumps({
    'upstream': pin, 'productionReady': False, 'exitCode': result.returncode,
    'status': 'blocked' if result.returncode else 'tested-only', 'raceDetector': args.race,
    'testSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'patches': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in patches},
    'logSha256': hashlib.sha256((output / 'recovery.jsonl').read_bytes()).hexdigest(),
    'scope': 'NWC pay controller + actual SQLite; injected backend, no transport or live LDK',
    'outcomes': outcomes,
}, indent=2) + '\n')
for item in outcomes:
    print(f"{item['result']}: {item['test']}")
print('Deployment blocked by failed acceptance.' if result.returncode else 'Controller acceptance passed; production remains disabled.')
raise SystemExit(result.returncode)
